import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { InspectDocumentRetentionDto } from '../../Documents/DataTransferObjects/document-retention-scope.dto.ts'
import type { DocumentRevisionRepository } from '../Contracts/document-revision.repository.ts'
import type { InspectDocumentRevisionRetentionUseCaseContract } from '../Contracts/inspect-document-revision-retention.use-case.contract.ts'

export class InspectDocumentRevisionRetentionUseCase implements InspectDocumentRevisionRetentionUseCaseContract {
  constructor(private readonly documentRevisionRepository: DocumentRevisionRepository) {}

  async execute(inspectDocumentRetentionDTO: InspectDocumentRetentionDto): Promise<DocumentRevision | null> {
    const documentRevisionDocumentQO = { documentId: inspectDocumentRetentionDTO.documentId }

    return this.documentRevisionRepository.findByDocumentIdOrderByCreatedAtDesc(documentRevisionDocumentQO)
  }
}
