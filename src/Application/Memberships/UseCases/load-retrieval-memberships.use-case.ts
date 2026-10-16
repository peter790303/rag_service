import type { Membership } from '../../../Domain/Membership/membership.ts'
import { LoadRetrievalMembershipsUseCaseContract } from '../Contracts/load-retrieval-memberships.use-case.contract.ts'
import type { MembershipRepository } from '../Contracts/membership.repository.ts'
import type { LoadRetrievalMembershipsDto } from '../DataTransferObjects/load-retrieval-memberships.dto.ts'

/** Publishes only the facts in this feature's requested retrieval scope. */
export class LoadRetrievalMembershipsUseCase extends LoadRetrievalMembershipsUseCaseContract {
  constructor(private readonly membershipRepository: MembershipRepository) {
    super()
  }

  async execute(loadRetrievalMembershipsDTO: LoadRetrievalMembershipsDto): Promise<Membership[]> {
    const { knowledgeBaseId } = loadRetrievalMembershipsDTO
    const retrievalKnowledgeBaseMemberships = await this.membershipRepository.findByKnowledgeBaseIdOrderByDocumentIdAsc(
      { knowledgeBaseId },
    )

    return retrievalKnowledgeBaseMemberships
  }
}
