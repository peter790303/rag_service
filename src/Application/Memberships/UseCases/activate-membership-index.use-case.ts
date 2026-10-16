import type { Membership } from '../../../Domain/Membership/membership.ts'
import { IndexingMembershipAssembler } from '../Assemblers/indexing-membership.assembler.ts'
import type { ActivateMembershipIndexUseCaseContract } from '../Contracts/activate-membership-index.use-case.contract.ts'
import type { MembershipRepository } from '../Contracts/membership.repository.ts'
import { MembershipInputGuard } from '../Guards/membership-input.guard.ts'

/** Activates a ready queued target only while both requested and active targets still match. */
export class ActivateMembershipIndexUseCase implements ActivateMembershipIndexUseCaseContract {
  constructor(private readonly membershipRepository: MembershipRepository) {}

  async execute(activateMembershipIndexDTO: {
    knowledgeBaseId: string
    documentId: string
    generation: string
    expectedActiveDocumentIndexId: string | null
    documentIndexId: string
  }): Promise<Membership | null> {
    MembershipInputGuard.assertSource(activateMembershipIndexDTO.knowledgeBaseId, activateMembershipIndexDTO.documentId)
    MembershipInputGuard.assertActivation(
      activateMembershipIndexDTO.generation,
      activateMembershipIndexDTO.expectedActiveDocumentIndexId,
      activateMembershipIndexDTO.documentIndexId,
    )

    const membershipSourceQO = {
      knowledgeBaseId: activateMembershipIndexDTO.knowledgeBaseId,
      documentId: activateMembershipIndexDTO.documentId,
    }
    const membership = await this.membershipRepository.findByKnowledgeBaseIdAndDocumentId(membershipSourceQO)

    if (
      membership === null ||
      membership.requestedGeneration !== activateMembershipIndexDTO.generation ||
      membership.activeDocumentIndexId !== activateMembershipIndexDTO.expectedActiveDocumentIndexId
    )
      return null

    const activatedMembership = membership.activateIndex(activateMembershipIndexDTO.documentIndexId, new Date())
    const membershipActivationQO = IndexingMembershipAssembler.toMembershipActivationQO(
      activatedMembership,
      activateMembershipIndexDTO.expectedActiveDocumentIndexId,
      activateMembershipIndexDTO.documentIndexId,
    )

    return this.membershipRepository.updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId(
      membershipActivationQO,
    )
  }
}
