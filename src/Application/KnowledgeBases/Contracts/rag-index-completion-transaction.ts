import type { ClaimedRagIndexJobContract } from './rag-job-claim-transaction.js'

export type RagIndexCompletionMembership = {
  requestedGeneration: number
  activeDocumentIndexId: string | null
}

export abstract class RagIndexCompletionTransaction {
  abstract lockDocument(documentId: string): Promise<boolean>

  abstract lockMembership(knowledgeBaseId: string, documentId: string): Promise<RagIndexCompletionMembership | null>

  abstract lockClaimedJob(job: ClaimedRagIndexJobContract, now: Date): Promise<void>

  abstract lockIndexesById(documentIndexIds: string[]): Promise<string[]>

  abstract markIndexReady(documentIndexId: string, readyAt: Date): Promise<void>

  abstract activateMembership(knowledgeBaseId: string, documentId: string, documentIndexId: string): Promise<void>

  abstract markIndexUnreferenced(documentIndexId: string, unreferencedSince: Date): Promise<void>

  abstract removeClaimedJob(job: ClaimedRagIndexJobContract): Promise<void>
}

/** A single database transaction for persistence operations used by completion orchestration. */
export abstract class RagIndexCompletionTransactionRepository {
  abstract withCompletionTransaction<T>(
    operation: (transaction: RagIndexCompletionTransaction) => Promise<T>,
  ): Promise<T>
}
