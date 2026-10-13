export type MembershipPruneJob = {
  id: string
  status: string
  leaseExpiresAt: Date | null
}

export type MembershipPruneRecord = {
  membershipId: string
  knowledgeBaseId: string
  documentId: string
  activeDocumentIndexId: string | null
  jobs: MembershipPruneJob[]
}

export abstract class MembershipPruneTransaction {
  abstract findMembershipPruneRecords(
    projectId: string,
    knowledgeBaseId: string,
    documentIds: string[],
  ): Promise<MembershipPruneRecord[]>

  abstract clearActiveIndex(membershipId: string): Promise<boolean>

  abstract removeMembership(membershipId: string): Promise<boolean>

  abstract cancelJobsForDocument(knowledgeBaseId: string, documentId: string): Promise<void>
}

export abstract class RagMembershipPruningStore {
  abstract withPruneTransaction<T>(work: (transaction: MembershipPruneTransaction) => Promise<T>): Promise<T>
}

export type GarbageIndexCandidate = {
  documentIndexId: string
  documentId: string
  status: string
  unreferencedSince: Date | null
  readyAt: Date | null
  membershipCount: number
  jobCount: number
  failedJobCount: number
  activeLeaseCount: number
}

export abstract class GarbageCollectionTransaction {
  abstract deleteExpiredUnreferencedFailedJobs(cutoff: Date): Promise<number>

  abstract findGarbageIndexCandidates(): Promise<GarbageIndexCandidate[]>

  abstract deleteIfUnreferenced(documentIndexId: string, cutoff: Date): Promise<boolean>
}

export abstract class RagGarbageCollectionStore {
  abstract withGarbageCollectionTransaction<T>(
    work: (transaction: GarbageCollectionTransaction) => Promise<T>,
  ): Promise<T>
}
