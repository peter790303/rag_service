import { InvalidRagJobLeaseException } from '../../../Domain/Knowledge/Exceptions/invalid-rag-job-lease.exception.js'
import { KnowledgeIndexPendingException } from '../../../Domain/Knowledge/Exceptions/knowledge-index-pending.exception.js'
import type { RagIndexCompletionTransactionRepository } from '../Contracts/rag-index-completion-transaction.js'
import type { ClaimedRagIndexJob } from '../DataTransferObjects/rag-index-job.dto.js'

/** Coordinates index readiness, membership activation, and claimed-job removal atomically. */
export class CompleteRagIndexJobUseCase {
  constructor(private readonly transactions: RagIndexCompletionTransactionRepository) {}

  async execute(job: ClaimedRagIndexJob, completedAt: Date): Promise<void> {
    await this.transactions.withCompletionTransaction(async (transaction) => {
      const documentExists = await transaction.lockDocument(job.documentId)

      if (!documentExists) throw new KnowledgeIndexPendingException('Document disappeared before completion')

      const membership = await transaction.lockMembership(job.knowledgeBaseId, job.documentId)

      if (membership?.requestedGeneration !== Number(job.generation)) throw new InvalidRagJobLeaseException()

      await transaction.lockClaimedJob(job, new Date())
      const previousIndexId = membership.activeDocumentIndexId
      const lockedIndexIds = await transaction.lockIndexesById([
        job.documentIndexId,
        ...(previousIndexId ? [previousIndexId] : []),
      ])

      if (!lockedIndexIds.includes(job.documentIndexId)) {
        throw new KnowledgeIndexPendingException('Index disappeared before completion')
      }

      await transaction.markIndexReady(job.documentIndexId, completedAt)

      await transaction.activateMembership(job.knowledgeBaseId, job.documentId, job.documentIndexId)

      if (previousIndexId && previousIndexId !== job.documentIndexId) {
        await transaction.markIndexUnreferenced(previousIndexId, completedAt)
      }

      await transaction.removeClaimedJob(job)
    })
  }
}
