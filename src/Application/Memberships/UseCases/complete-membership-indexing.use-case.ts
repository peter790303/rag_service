import type { Membership } from '../../../Domain/Membership/membership.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../DocumentIndexes/Exceptions/invalid-document-index-execution-lease.exception.ts'
import { IndexingMembershipAssembler } from '../Assemblers/indexing-membership.assembler.ts'
import type { CompleteMembershipIndexingUseCaseContract } from '../Contracts/complete-membership-indexing.use-case.contract.ts'
import type { MembershipRepository } from '../Contracts/membership.repository.ts'

/** Publishes the completed target only for the reserved generation and prior active target. */
export class CompleteMembershipIndexingUseCase implements CompleteMembershipIndexingUseCaseContract {
  constructor(private readonly membershipRepository: MembershipRepository) {}

  async execute(completeMembershipIndexingDTO: {
    membership: Membership
    generation: string
    documentIndexId: string
  }): Promise<void> {
    if (completeMembershipIndexingDTO.membership.requestedGeneration !== completeMembershipIndexingDTO.generation)
      throw new InvalidDocumentIndexExecutionLeaseException()

    const activatedMembership = completeMembershipIndexingDTO.membership.activateIndex(
      completeMembershipIndexingDTO.documentIndexId,
      new Date(),
    )
    const membershipActivationQO = IndexingMembershipAssembler.toMembershipActivationQO(
      activatedMembership,
      completeMembershipIndexingDTO.membership.activeDocumentIndexId,
      completeMembershipIndexingDTO.documentIndexId,
    )
    const activated =
      await this.membershipRepository.updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId(
        membershipActivationQO,
      )

    if (activated === null) throw new InvalidDocumentIndexExecutionLeaseException()
  }
}
