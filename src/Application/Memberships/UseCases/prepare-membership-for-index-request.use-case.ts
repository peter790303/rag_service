import { Membership } from '../../../Domain/Membership/membership.ts'
import type { SourceDocumentDto } from '../../Documents/DataTransferObjects/source-document.dto.ts'
import { IndexingMembershipAssembler } from '../Assemblers/indexing-membership.assembler.ts'
import type { MembershipRepository } from '../Contracts/membership.repository.ts'
import type { PrepareMembershipForIndexRequestUseCaseContract } from '../Contracts/prepare-membership-for-index-request.use-case.contract.ts'
import { IndexRequestMembershipUnavailableException } from '../Exceptions/index-request-membership-unavailable.exception.ts'
import { MembershipInputGuard } from '../Guards/membership-input.guard.ts'

/** Creates and configures membership under the request's existing source lock. */
export class PrepareMembershipForIndexRequestUseCase implements PrepareMembershipForIndexRequestUseCaseContract {
  constructor(private readonly membershipRepository: MembershipRepository) {}

  async execute(prepareMembershipForIndexRequestDTO: {
    sourceDocument: SourceDocumentDto
    documentId: string
  }): Promise<Membership> {
    MembershipInputGuard.assertSource(
      prepareMembershipForIndexRequestDTO.sourceDocument.knowledgeBaseId,
      prepareMembershipForIndexRequestDTO.documentId,
    )
    MembershipInputGuard.assertConfiguration(
      prepareMembershipForIndexRequestDTO.sourceDocument.isEntry,
      prepareMembershipForIndexRequestDTO.sourceDocument.alwaysIncludeFullContent,
    )

    const membershipSourceQO = {
      knowledgeBaseId: prepareMembershipForIndexRequestDTO.sourceDocument.knowledgeBaseId,
      documentId: prepareMembershipForIndexRequestDTO.documentId,
    }
    let membership = await this.membershipRepository.lockByKnowledgeBaseIdAndDocumentId(membershipSourceQO)

    if (membership === null) {
      const newMembership = new Membership({
        knowledgeBaseId: membershipSourceQO.knowledgeBaseId,
        documentId: membershipSourceQO.documentId,
        requestedGeneration: '0',
        activeDocumentIndexId: null,
        isEntry: false,
        alwaysIncludeFullContent: false,
        updatedAt: new Date(),
      })
      const insertMembershipQO = IndexingMembershipAssembler.toInsertMembershipQO(newMembership)
      await this.membershipRepository.insert(insertMembershipQO)
      membership = await this.membershipRepository.lockByKnowledgeBaseIdAndDocumentId(membershipSourceQO)
    }

    if (membership === null) throw new IndexRequestMembershipUnavailableException()

    const sourceDocumentDTO = prepareMembershipForIndexRequestDTO.sourceDocument

    if (sourceDocumentDTO.isEntry === undefined && sourceDocumentDTO.alwaysIncludeFullContent === undefined)
      return membership

    const configuredMembership = membership.configure(sourceDocumentDTO, new Date())
    const updateMembershipQO = IndexingMembershipAssembler.toUpdateMembershipQO(configuredMembership)
    await this.membershipRepository.updateByKnowledgeBaseIdAndDocumentId(updateMembershipQO)

    return configuredMembership
  }
}
