import type { Document } from '../../../Domain/Document/document.ts'
import type { InspectDocumentIndexRetentionUseCaseContract } from '../../DocumentIndexes/Contracts/inspect-document-index-retention.use-case.contract.ts'
import type { InspectDocumentRelationRetentionUseCaseContract } from '../../DocumentRelations/Contracts/inspect-document-relation-retention.use-case.contract.ts'
import type { InspectDocumentRevisionRetentionUseCaseContract } from '../../DocumentRevisions/Contracts/inspect-document-revision-retention.use-case.contract.ts'
import type { InspectMembershipRetentionUseCaseContract } from '../../Memberships/Contracts/inspect-membership-retention.use-case.contract.ts'
import { RetentionDocumentAssembler } from '../Assemblers/retention-document.assembler.ts'
import type { DocumentRepository } from '../Contracts/document.repository.ts'
import type { InspectDocumentRetentionUseCaseContract } from '../Contracts/inspect-document-retention.use-case.contract.ts'
import type { InspectDocumentRetentionDto } from '../DataTransferObjects/document-retention-scope.dto.ts'

export class InspectDocumentRetentionUseCase implements InspectDocumentRetentionUseCaseContract {
  constructor(
    private readonly membershipRetention: InspectMembershipRetentionUseCaseContract,
    private readonly revisionRetention: InspectDocumentRevisionRetentionUseCaseContract,
    private readonly indexRetention: InspectDocumentIndexRetentionUseCaseContract,
    private readonly relationRetention: InspectDocumentRelationRetentionUseCaseContract,
    private readonly documentRepository: DocumentRepository,
  ) {}

  async execute(inspectDocumentRetentionDTO: InspectDocumentRetentionDto): Promise<Document | null> {
    const membershipProtectsDocument = await this.membershipRetention.execute(
      RetentionDocumentAssembler.toMembershipRetentionDTO(inspectDocumentRetentionDTO),
    )
    const revisionProtectsDocument = await this.revisionRetention.execute(
      RetentionDocumentAssembler.toInspectDocumentRetentionDTO(inspectDocumentRetentionDTO.documentId),
    )
    const indexProtectsDocument = await this.indexRetention.execute(
      RetentionDocumentAssembler.toDocumentIndexRetentionDTO(inspectDocumentRetentionDTO),
    )
    const relationProtectsDocument = await this.relationRetention.execute(
      RetentionDocumentAssembler.toInspectDocumentRetentionDTO(inspectDocumentRetentionDTO.documentId),
    )

    if (!membershipProtectsDocument && !revisionProtectsDocument && !indexProtectsDocument && !relationProtectsDocument)
      return null

    return this.documentRepository.findByDocumentId(
      RetentionDocumentAssembler.toDocumentIdQO(inspectDocumentRetentionDTO.documentId),
    )
  }
}
