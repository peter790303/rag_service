import { concatMap, from, lastValueFrom, toArray } from 'rxjs'

import type { ReserveDocumentForIndexingCommandHandlerContract } from '../../../Documents/Application/Contracts/reserve-document-for-indexing.command.handler.contract.ts'
import type { CompleteKnowledgeBaseDocumentIndexingCommandHandlerContract } from '../../../KnowledgeBases/Application/Contracts/complete-knowledge-base-document-indexing.command.handler.contract.ts'
import type { GetIndexingKnowledgeBaseQueryHandlerContract } from '../../../KnowledgeBases/Application/Contracts/get-indexing-knowledge-base.query.handler.contract.ts'
import type { ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract } from '../../../KnowledgeBases/Application/Contracts/reserve-knowledge-base-document-for-indexing.command.handler.contract.ts'
import type { PersistenceTransaction } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'
import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import { ReadLeaseDocumentIndexesAssembler } from '../Assemblers/read-lease-document-indexes.assembler.ts'
import { WriteLifecycleDocumentIndexAssembler } from '../Assemblers/write-lifecycle-document-index.assembler.ts'
import type { DocumentIndexedEvent } from '../Events/document-indexed.event.ts'
import { DocumentDisappearedBeforeIndexCompletionException } from '../Exceptions/document-disappeared-before-index-completion.exception.ts'
import { DocumentIndexingNotFoundException } from '../Exceptions/document-indexing-not-found.exception.ts'
import { IndexDisappearedBeforeCompletionException } from '../Exceptions/index-disappeared-before-completion.exception.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../Exceptions/invalid-document-index-execution-lease.exception.ts'
import { DocumentIndexExecutionLeaseGuard } from '../Guards/document-index-execution-lease.guard.ts'
import type { DocumentIndexExecutionQueue } from '../Ports/Out/Gateways/document-index-execution.queue.ts'
import type { DocumentIndexSuccessArchive } from '../Ports/Out/Gateways/document-index-success.archive.ts'
import type { DocumentIndexRepository } from '../Ports/Out/Repositories/document-index.repository.ts'

/** Coordinates index readiness, knowledgeBaseDocument activation, and claimed-job removal atomically. */
export class DocumentIndexedListener {
  constructor(
    private readonly transaction: PersistenceTransaction,
    private readonly reserveDocumentForIndexing: ReserveDocumentForIndexingCommandHandlerContract,
    private readonly reserveKnowledgeBaseDocumentForIndexing: ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly completeKnowledgeBaseDocumentIndexing: CompleteKnowledgeBaseDocumentIndexingCommandHandlerContract,
    private readonly getIndexingKnowledgeBase: GetIndexingKnowledgeBaseQueryHandlerContract,
    private readonly documentIndexSuccessArchive: DocumentIndexSuccessArchive,
  ) {}

  async handle({ jobDelivery, completedAt }: DocumentIndexedEvent): Promise<void> {
    await this.transaction.run(async () => {
      const knowledgeBase = await this.getIndexingKnowledgeBase.execute({
        knowledgeBaseId: jobDelivery.knowledgeBaseId,
      })

      if (knowledgeBase === null) throw new DocumentIndexingNotFoundException(jobDelivery.id)

      const documentExists = await this.reserveDocumentForIndexing.execute({ documentId: jobDelivery.documentId })

      if (!documentExists) throw new DocumentDisappearedBeforeIndexCompletionException()

      const knowledgeBaseDocumentRecord = await this.reserveKnowledgeBaseDocumentForIndexing.execute({
        knowledgeBaseId: jobDelivery.knowledgeBaseId,
        documentId: jobDelivery.documentId,
        generation: jobDelivery.generation,
      })

      if (knowledgeBaseDocumentRecord?.requestedGeneration !== jobDelivery.generation)
        throw new InvalidDocumentIndexExecutionLeaseException()

      const jobRecord = await this.documentIndexExecutionQueue.lockExecution({ jobId: jobDelivery.id })

      if (jobRecord === null) throw new InvalidDocumentIndexExecutionLeaseException()

      const jobLease = ReadLeaseDocumentIndexesAssembler.toDocumentIndexExecutionLease(jobRecord)

      DocumentIndexExecutionLeaseGuard.assertCurrentClaim(jobDelivery, jobLease, new Date())

      const previousDocumentIndexId = knowledgeBaseDocumentRecord.activeDocumentIndexId
      const documentIndexIds = new Set([jobDelivery.documentIndexId])

      if (previousDocumentIndexId !== null) documentIndexIds.add(previousDocumentIndexId)

      const lockedDocumentIndexes = new Map<string, DocumentIndex>()

      // Row locks must be acquired one at a time in deterministic index order.
      const lockDocumentIndex = async (documentIndexId: string): Promise<void> => {
        const restoredDocumentIndexDTO = await this.documentIndexRepository.lockByDocumentIndexId({
          documentIndexId: documentIndexId,
        })

        if (restoredDocumentIndexDTO !== null) lockedDocumentIndexes.set(documentIndexId, restoredDocumentIndexDTO)
      }
      const orderedDocumentIndexIds = [...documentIndexIds].sort()

      await lastValueFrom(from(orderedDocumentIndexIds).pipe(concatMap(lockDocumentIndex), toArray()))

      const targetDocumentIndex = lockedDocumentIndexes.get(jobDelivery.documentIndexId)

      if (targetDocumentIndex === undefined) throw new IndexDisappearedBeforeCompletionException()

      const readyDocumentIndex = targetDocumentIndex.markReady(completedAt)
      const readyDocumentIndexLifecycleQO =
        WriteLifecycleDocumentIndexAssembler.toSaveDocumentIndexLifecycleQO(readyDocumentIndex)

      await this.documentIndexRepository.updateByDocumentIndexIdWithLifecycleFields(readyDocumentIndexLifecycleQO)
      await this.completeKnowledgeBaseDocumentIndexing.execute({
        knowledgeBaseDocument: knowledgeBaseDocumentRecord,
        generation: jobDelivery.generation,
        documentIndexId: jobDelivery.documentIndexId,
      })

      if (previousDocumentIndexId !== null && previousDocumentIndexId !== jobDelivery.documentIndexId) {
        const previousDocumentIndex = lockedDocumentIndexes.get(previousDocumentIndexId)

        if (previousDocumentIndex !== undefined) {
          const unreferencedDocumentIndex = previousDocumentIndex.markUnreferenced(completedAt)
          const unreferencedDocumentIndexLifecycleQO =
            WriteLifecycleDocumentIndexAssembler.toSaveDocumentIndexLifecycleQO(unreferencedDocumentIndex)

          await this.documentIndexRepository.updateByDocumentIndexIdWithLifecycleFields(
            unreferencedDocumentIndexLifecycleQO,
          )
        }
      }

      await this.documentIndexSuccessArchive.archiveSuccess({
        projectId: knowledgeBase.projectId,
        jobId: jobDelivery.id,
        knowledgeBaseId: jobDelivery.knowledgeBaseId,
        documentId: jobDelivery.documentId,
        documentIndexId: jobDelivery.documentIndexId,
        generation: jobDelivery.generation,
        attempts: jobRecord.attempts,
        executionVerification: DocumentIndexedListener.toSuccessfulExecutionVerification(
          jobRecord.executionVerification,
        ),
        completedAt,
      })

      await this.documentIndexExecutionQueue.releaseExecution({ jobId: jobDelivery.id })
    })
  }

  private static toSuccessfulExecutionVerification(
    executionVerification: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (executionVerification === null) return null

    const successfulExecutionVerification = { ...executionVerification }

    delete successfulExecutionVerification.claim_token
    delete successfulExecutionVerification.lease_expires_at
    delete successfulExecutionVerification.claimToken
    delete successfulExecutionVerification.leaseExpiresAt

    return successfulExecutionVerification
  }
}
