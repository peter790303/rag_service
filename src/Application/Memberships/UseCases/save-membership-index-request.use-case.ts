import type { Membership } from '../../../Domain/Membership/membership.ts'
import { IndexingMembershipAssembler } from '../Assemblers/indexing-membership.assembler.ts'
import type { MembershipRepository } from '../Contracts/membership.repository.ts'
import type { SaveMembershipIndexRequestUseCaseContract } from '../Contracts/save-membership-index-request.use-case.contract.ts'

/** Records the target generation chosen while the request holds the membership lock. */
export class SaveMembershipIndexRequestUseCase implements SaveMembershipIndexRequestUseCaseContract {
  constructor(private readonly membershipRepository: MembershipRepository) {}

  async execute(saveMembershipIndexRequestDTO: {
    membership: Membership
    generation: string
    activeDocumentIndexId: string | null
  }): Promise<void> {
    const requestedMembership = saveMembershipIndexRequestDTO.membership.requestIndex(
      {
        generation: saveMembershipIndexRequestDTO.generation,
        activeDocumentIndexId: saveMembershipIndexRequestDTO.activeDocumentIndexId,
      },
      new Date(),
    )
    const updateMembershipQO = IndexingMembershipAssembler.toUpdateMembershipQO(requestedMembership)
    await this.membershipRepository.updateByKnowledgeBaseIdAndDocumentId(updateMembershipQO)
  }
}
