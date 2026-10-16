import type { Membership } from '../../../Domain/Membership/membership.ts'
import type { StartDocumentIndexPruningRetentionUseCaseContract } from '../../DocumentIndexes/Contracts/start-document-index-pruning-retention.use-case.contract.ts'
import type { LockDocumentRetentionParentsUseCaseContract } from '../../Documents/Contracts/lock-document-retention-parents.use-case.contract.ts'
import type { StartDocumentPruningRetentionUseCaseContract } from '../../Documents/Contracts/start-document-pruning-retention.use-case.contract.ts'
import type { PersistenceTransaction } from '../../KnowledgeBases/Contracts/persistence-transaction.ts'
import type { ValidateKnowledgeBasePruningUseCaseContract } from '../../KnowledgeBases/Contracts/validate-knowledge-base-pruning.use-case.contract.ts'
import { PruningMembershipAssembler } from '../Assemblers/pruning-membership.assembler.ts'
import type { MembershipRepository } from '../Contracts/membership.repository.ts'
import type { PruneKnowledgeBaseMembershipsDto } from '../DataTransferObjects/prune-knowledge-base-memberships.dto.ts'
import type { CancelMembershipIndexingListener } from '../Listeners/cancel-membership-indexing.listener.ts'

export class PruneKnowledgeBaseMembershipsUseCase {
  constructor(
    private readonly persistenceTransaction: PersistenceTransaction,
    private readonly validatePruningScope: ValidateKnowledgeBasePruningUseCaseContract,
    private readonly lockDocumentParents: LockDocumentRetentionParentsUseCaseContract,
    private readonly membershipRepository: MembershipRepository,
    private readonly cancelMembershipIndexing: Pick<CancelMembershipIndexingListener, 'handle'>,
    private readonly startIndexRetention: StartDocumentIndexPruningRetentionUseCaseContract,
    private readonly startDocumentRetention: StartDocumentPruningRetentionUseCaseContract,
  ) {}

  async execute(pruneKnowledgeBaseMembershipsDTO: PruneKnowledgeBaseMembershipsDto): Promise<Membership[]> {
    const now = new Date()

    return this.persistenceTransaction.run(async () => {
      if (
        !(await this.validatePruningScope.execute(
          PruningMembershipAssembler.toKnowledgeBasePruningScopeDTO(pruneKnowledgeBaseMembershipsDTO),
        ))
      )
        return []

      const retainedDocumentIds = new Set(pruneKnowledgeBaseMembershipsDTO.documentIds)
      const candidates = (
        await this.membershipRepository.findByKnowledgeBaseIdOrderByDocumentIdAsc(
          PruningMembershipAssembler.toMembershipKnowledgeBaseQO(pruneKnowledgeBaseMembershipsDTO),
        )
      )
        .filter((candidate) => !retainedDocumentIds.has(candidate.documentId))
        .sort((left, right) => left.documentId.localeCompare(right.documentId))
      // Acquire all document parents before membership, job, and index children.
      const lockedDocuments = await this.lockDocumentParents.execute(
        PruningMembershipAssembler.toLockDocumentRetentionParentsDTO(candidates),
      )
      const lockedDocumentIds = lockedDocuments.map((document) => document.id)
      const prunedMemberships: Membership[] = []
      // Parent locks precede sorted child locks. Sequential transactions prevent conflicting child lock order.
      for (const candidate of candidates) {
        const prunedMembership = await this.pruneMembership(candidate, now, lockedDocumentIds)

        if (prunedMembership !== null) prunedMemberships.push(prunedMembership)
      }

      return prunedMemberships
    })
  }

  private async pruneMembership(
    candidate: Membership,
    now: Date,
    lockedDocumentIds: readonly string[],
  ): Promise<Membership | null> {
    const membership = await this.membershipRepository.lockByKnowledgeBaseIdAndDocumentId(
      PruningMembershipAssembler.toMembershipSourceQO(candidate),
    )

    if (membership === null) return null

    const cancelledIndexIds = await this.cancelMembershipIndexing.handle(
      PruningMembershipAssembler.toMembershipPruningRequestedEvent(candidate),
    )
    const detachedIndexIds = new Set(cancelledIndexIds)

    if (membership.activeDocumentIndexId !== null) detachedIndexIds.add(membership.activeDocumentIndexId)

    await this.membershipRepository.updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentId(
      PruningMembershipAssembler.toUpdateDetachedMembershipQO(membership.detachIndex(now)),
    )
    await this.membershipRepository.removeByKnowledgeBaseIdAndDocumentId(
      PruningMembershipAssembler.toMembershipSourceQO(candidate),
    )
    await this.startIndexRetention.execute(
      PruningMembershipAssembler.toStartDocumentIndexPruningRetentionDTO(detachedIndexIds, now),
    )
    await this.startDocumentRetention.execute(
      PruningMembershipAssembler.toStartDocumentPruningRetentionDTO(candidate, now, lockedDocumentIds),
    )

    return membership
  }
}
