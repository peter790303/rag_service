import { KnowledgeMembershipPruneConflictException } from '../../../Domain/Knowledge/Exceptions/knowledge-membership-prune-conflict.exception.js'
import type { MembershipPruneRecord, MembershipPruneTransaction } from '../Contracts/rag-retention-operations.js'
import type { RagMembershipPruningStore } from '../Contracts/rag-retention-store.js'
import type { PruneRagMembershipsDto } from '../DataTransferObjects/rag.dto.js'
import { hasDocumentReferences } from '../Helpers/document-retention.helper.js'

export class PruneRagMembershipsUseCase {
  constructor(private readonly memberships: RagMembershipPruningStore) {}

  async execute({ projectId, knowledgeBaseId, documentIds }: PruneRagMembershipsDto): Promise<{ pruned: number }> {
    const now = new Date()

    return this.memberships.withPruneTransaction(async (transaction) => {
      if (!(await transaction.isKnowledgeBaseInProject(projectId, knowledgeBaseId))) return { pruned: 0 }

      const retainedDocumentIds = new Set(documentIds)
      const candidates = (await transaction.findMembershipPruneRecords(knowledgeBaseId))
        .filter((candidate) => !retainedDocumentIds.has(candidate.documentId))
        .sort((left, right) => left.documentId.localeCompare(right.documentId))

      // Serial parent-before-child locks keep prune and GC in the same lock order.
      const pruned = await candidates.reduce(async (previousCount, candidate) => {
        const prunedCount = await previousCount

        return prunedCount + Number(await this.pruneMembership(transaction, candidate, now))
      }, Promise.resolve(0))

      return { pruned }
    })
  }

  private async pruneMembership(
    transaction: MembershipPruneTransaction,
    candidate: MembershipPruneRecord,
    now: Date,
  ): Promise<boolean> {
    const documentLocked = await transaction.lockDocumentForPrune(candidate.documentId)
    const membership = await transaction.lockMembershipForPrune(candidate.knowledgeBaseId, candidate.documentId)

    if (!membership) return false

    const cancelledIndexIds = await transaction.cancelJobsForDocument(candidate.knowledgeBaseId, candidate.documentId)
    await transaction.clearActiveIndex(candidate.knowledgeBaseId, candidate.documentId)
    const membershipRemoved = await transaction.removeMembership(candidate.knowledgeBaseId, candidate.documentId)

    if (!membershipRemoved) {
      throw new KnowledgeMembershipPruneConflictException(candidate.knowledgeBaseId, candidate.documentId)
    }

    const detachedIndexIds = [
      ...new Set([
        ...cancelledIndexIds,
        ...(membership.activeDocumentIndexId ? [membership.activeDocumentIndexId] : []),
      ]),
    ].sort()

    await detachedIndexIds.reduce(async (previousRetention, documentIndexId) => {
      await previousRetention
      await this.startDetachedIndexRetention(transaction, documentIndexId, now)
    }, Promise.resolve())

    if (documentLocked && !(await hasDocumentReferences(transaction, candidate.documentId))) {
      await transaction.markDocumentUnreferenced(candidate.documentId, now)
    }

    return true
  }

  private async startDetachedIndexRetention(
    transaction: MembershipPruneTransaction,
    documentIndexId: string,
    now: Date,
  ): Promise<void> {
    if (!(await transaction.lockIndexForPrune(documentIndexId))) return

    const membershipCount = await transaction.countMembershipsForIndex(documentIndexId)
    const jobCount = await transaction.countJobsForIndex(documentIndexId)

    if (membershipCount === 0 && jobCount === 0) {
      await transaction.markIndexUnreferenced(documentIndexId, now)
    }
  }
}
