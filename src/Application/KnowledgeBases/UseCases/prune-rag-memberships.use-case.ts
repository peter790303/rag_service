import { RagMembershipPruningStore } from '../../../Infrastructure/Persistence/Repositories/Contracts/rag-retention-store.js'

export class PruneRagMembershipsUseCase {
  constructor(private readonly memberships: RagMembershipPruningStore) {}

  async execute(projectId: string, knowledgeBaseId: string, documentIds: string[]): Promise<{ pruned: number }> {
    return this.memberships.withPruneTransaction(async (transaction) => {
      const candidates = await transaction.findMembershipPruneRecords(projectId, knowledgeBaseId, documentIds)
      let pruned = 0

      for (const candidate of candidates) {
        if (candidate.activeDocumentIndexId) await transaction.clearActiveIndex(candidate.membershipId)

        const membershipRemoved = await transaction.removeMembership(candidate.membershipId)

        if (!membershipRemoved) throw new Error(`Failed to remove membership ${candidate.membershipId}`)

        await transaction.cancelJobsForDocument(candidate.knowledgeBaseId, candidate.documentId)
        pruned += 1
      }

      return { pruned }
    })
  }
}
