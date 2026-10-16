import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { ReserveDocumentForIndexingUseCaseContract } from '../../Documents/Contracts/reserve-document-for-indexing.use-case.contract.ts'
import type { PersistenceTransaction } from '../../KnowledgeBases/Contracts/persistence-transaction.ts'
import type { CompleteMembershipIndexingUseCaseContract } from '../../Memberships/Contracts/complete-membership-indexing.use-case.contract.ts'
import type { ReserveMembershipForIndexingUseCaseContract } from '../../Memberships/Contracts/reserve-membership-for-indexing.use-case.contract.ts'
import { ReadLeaseDocumentIndexesAssembler } from '../Assemblers/read-lease-document-indexes.assembler.ts'
import { WriteLifecycleDocumentIndexAssembler } from '../Assemblers/write-lifecycle-document-index.assembler.ts'
import type { DocumentIndexExecutionQueue } from '../Contracts/document-index-execution.queue.ts'
import type { DocumentIndexRepository } from '../Contracts/document-index.repository.ts'
import type { DocumentIndexedEvent } from '../Events/document-indexed.event.ts'
import { DocumentDisappearedBeforeIndexCompletionException } from '../Exceptions/document-disappeared-before-index-completion.exception.ts'
import { IndexDisappearedBeforeCompletionException } from '../Exceptions/index-disappeared-before-completion.exception.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../Exceptions/invalid-document-index-execution-lease.exception.ts'
import { DocumentIndexExecutionLeaseGuard } from '../Guards/document-index-execution-lease.guard.ts'

/** Coordinates index readiness, membership activation, and claimed-job removal atomically. */
export class DocumentIndexedListener {
  constructor(
    private readonly transaction: PersistenceTransaction,
    private readonly reserveDocumentForIndexing: ReserveDocumentForIndexingUseCaseContract,
    private readonly reserveMembershipForIndexing: ReserveMembershipForIndexingUseCaseContract,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly completeMembershipIndexing: CompleteMembershipIndexingUseCaseContract,
  ) {}

  async handle({ jobDelivery, completedAt }: DocumentIndexedEvent): Promise<void> {
    await this.transaction.run(async () => {
      const documentExists = await this.reserveDocumentForIndexing.execute({ documentId: jobDelivery.documentId })

      if (!documentExists) throw new DocumentDisappearedBeforeIndexCompletionException()

      const membershipRecord = await this.reserveMembershipForIndexing.execute({
        knowledgeBaseId: jobDelivery.knowledgeBaseId,
        documentId: jobDelivery.documentId,
        generation: jobDelivery.generation,
      })

      if (membershipRecord?.requestedGeneration !== jobDelivery.generation)
        throw new InvalidDocumentIndexExecutionLeaseException()

      const jobRecord = await this.documentIndexExecutionQueue.lockExecution({ jobId: jobDelivery.id })
      const jobLease =
        jobRecord === null ? null : ReadLeaseDocumentIndexesAssembler.toDocumentIndexExecutionLease(jobRecord)

      DocumentIndexExecutionLeaseGuard.assertCurrentClaim(jobDelivery, jobLease, new Date())

      const previousDocumentIndexId = membershipRecord.activeDocumentIndexId
      const documentIndexIds = new Set([jobDelivery.documentIndexId])

      if (previousDocumentIndexId !== null) documentIndexIds.add(previousDocumentIndexId)

      const lockedDocumentIndexes = new Map<string, DocumentIndex>()

      // Row locks must be acquired one at a time in deterministic index order.
      await [...documentIndexIds].sort().reduce(async (previousIndexLock, documentIndexId) => {
        await previousIndexLock
        const restoredDocumentIndexDTO = await this.documentIndexRepository.lockByDocumentIndexId({
          documentIndexId: documentIndexId,
        })

        if (restoredDocumentIndexDTO !== null) lockedDocumentIndexes.set(documentIndexId, restoredDocumentIndexDTO)
      }, Promise.resolve())

      const targetDocumentIndex = lockedDocumentIndexes.get(jobDelivery.documentIndexId)

      if (targetDocumentIndex === undefined) throw new IndexDisappearedBeforeCompletionException()

      const readyDocumentIndex = targetDocumentIndex.markReady(completedAt)
      const readyDocumentIndexLifecycleQO =
        WriteLifecycleDocumentIndexAssembler.toSaveDocumentIndexLifecycleQO(readyDocumentIndex)

      await this.documentIndexRepository.updateByDocumentIndexIdWithLifecycleFields(readyDocumentIndexLifecycleQO)
      await this.completeMembershipIndexing.execute({
        membership: membershipRecord,
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

      await this.documentIndexExecutionQueue.releaseExecution({ jobId: jobDelivery.id })
    })
  }
}
