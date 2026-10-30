import type { ReserveDocumentForIndexingCommandHandlerContract } from '../../../Documents/Application/Contracts/reserve-document-for-indexing.command.handler.contract.ts'
import type { ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract } from '../../../KnowledgeBases/Application/Contracts/reserve-knowledge-base-document-for-indexing.command.handler.contract.ts'
import type { PersistenceTransaction } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'
import { ReadLeaseDocumentIndexesAssembler } from '../Assemblers/read-lease-document-indexes.assembler.ts'
import { WriteFailDocumentIndexesAssembler } from '../Assemblers/write-fail-document-indexes.assembler.ts'
import { WriteLifecycleDocumentIndexAssembler } from '../Assemblers/write-lifecycle-document-index.assembler.ts'
import type { DocumentIndexingFailedEvent } from '../Events/document-indexing-failed.event.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../Exceptions/invalid-document-index-execution-lease.exception.ts'
import { DocumentIndexExecutionLeaseGuard } from '../Guards/document-index-execution-lease.guard.ts'
import {
  DocumentIndexExecutionLifecycle,
  DOCUMENT_INDEX_EXECUTION_STATUS,
} from '../Helpers/document-index-execution-lifecycle.helper.ts'
import type { DocumentIndexExecutionQueue } from '../Ports/Out/Gateways/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../Ports/Out/Gateways/document-index-failure.archive.ts'
import type { DocumentIndexRepository } from '../Ports/Out/Repositories/document-index.repository.ts'

/** Applies a claimed worker's retry or archive outcome in one fenced transaction. */
export class DocumentIndexingFailedListener {
  constructor(
    private readonly transaction: PersistenceTransaction,
    private readonly reserveDocumentForIndexing: ReserveDocumentForIndexingCommandHandlerContract,
    private readonly reserveKnowledgeBaseDocumentForIndexing: ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly documentIndexFailureArchive: DocumentIndexFailureArchive,
  ) {}

  async handle({ jobDelivery, failureDecision }: DocumentIndexingFailedEvent): Promise<void> {
    await this.transaction.run(async () => {
      const documentExists = await this.reserveDocumentForIndexing.execute({ documentId: jobDelivery.documentId })
      const knowledgeBaseDocumentRecord = await this.reserveKnowledgeBaseDocumentForIndexing.execute({
        knowledgeBaseId: jobDelivery.knowledgeBaseId,
        documentId: jobDelivery.documentId,
        generation: jobDelivery.generation,
      })

      if (!documentExists || knowledgeBaseDocumentRecord?.requestedGeneration !== jobDelivery.generation) {
        throw new InvalidDocumentIndexExecutionLeaseException()
      }

      const jobRecord = await this.documentIndexExecutionQueue.lockExecution({ jobId: jobDelivery.id })
      const jobLease =
        jobRecord === null ? null : ReadLeaseDocumentIndexesAssembler.toDocumentIndexExecutionLease(jobRecord)

      DocumentIndexExecutionLeaseGuard.assertCurrentClaim(jobDelivery, jobLease, new Date())

      const restoredDocumentIndexDTO = await this.documentIndexRepository.lockByDocumentIndexId({
        documentIndexId: jobDelivery.documentIndexId,
      })

      if (restoredDocumentIndexDTO === null || jobRecord === null)
        throw new InvalidDocumentIndexExecutionLeaseException()

      const failedExecutionState = WriteFailDocumentIndexesAssembler.toFailedExecutionState(
        jobRecord.executionState,
        failureDecision.errorCode,
        failureDecision.errorMessage,
        failureDecision.failedAt,
      )

      const failureTransition = new DocumentIndexExecutionLifecycle({
        id: jobRecord.id,
        status: jobRecord.status,
        attempts: jobRecord.attempts,
        leaseExpiresAt: jobLease.leaseExpiresAt,
      }).afterFailure({ errorMessage: failureDecision.errorMessage, failedAt: failureDecision.failedAt })

      if (failureDecision.retryAt !== null && !failureTransition.terminal) {
        const jobRetryWrite = WriteFailDocumentIndexesAssembler.toDocumentIndexExecutionRetryWrite(
          DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
          failureDecision.retryAt,
          failedExecutionState,
        )

        await this.documentIndexExecutionQueue.rescheduleExecution({ jobId: jobRecord.id, ...jobRetryWrite })

        return
      }

      const saveFailedJobQO = WriteFailDocumentIndexesAssembler.toDocumentIndexFailureArchive(
        jobRecord,
        failureDecision.errorCode,
        failureDecision.errorMessage,
        failedExecutionState,
        failureDecision.failedAt,
      )
      const unreferencedDocumentIndex = restoredDocumentIndexDTO.markUnreferenced(failureDecision.failedAt)
      const unreferencedDocumentIndexLifecycleQO =
        WriteLifecycleDocumentIndexAssembler.toSaveDocumentIndexLifecycleQO(unreferencedDocumentIndex)

      await this.documentIndexFailureArchive.archive(saveFailedJobQO)
      await this.documentIndexRepository.updateByDocumentIndexIdWithLifecycleFields(
        unreferencedDocumentIndexLifecycleQO,
      )
      await this.documentIndexExecutionQueue.releaseExecution({ jobId: jobRecord.id })
    })
  }
}
