import type { Membership } from '../../../Domain/Membership/membership.ts'
import type { GetMembershipIndexingStateUseCaseContract } from '../Contracts/get-membership-indexing-state.use-case.contract.ts'
import type { MembershipRepository } from '../Contracts/membership.repository.ts'

/** Exposes the requested and active targets for indexing status and retry decisions. */
export class GetMembershipIndexingStateUseCase implements GetMembershipIndexingStateUseCaseContract {
  constructor(private readonly membershipRepository: MembershipRepository) {}

  async execute(getMembershipIndexingStateDTO: {
    knowledgeBaseId: string
    documentId: string
  }): Promise<Membership | null> {
    const membershipSourceQO = {
      knowledgeBaseId: getMembershipIndexingStateDTO.knowledgeBaseId,
      documentId: getMembershipIndexingStateDTO.documentId,
    }
    const membership = await this.membershipRepository.findByKnowledgeBaseIdAndDocumentId(membershipSourceQO)

    return membership
  }
}
