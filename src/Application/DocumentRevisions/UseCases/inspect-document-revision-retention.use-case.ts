import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { DocumentRevisionRepository } from '../Contracts/document-revision.repository.ts'
import type { InspectDocumentRevisionRetentionUseCaseContract } from '../Contracts/inspect-document-revision-retention.use-case.contract.ts'
import type { InspectDocumentRevisionRetentionDTO } from '../DataTransferObjects/inspect-document-revision-retention.dto.ts'

export class InspectDocumentRevisionRetentionUseCase implements InspectDocumentRevisionRetentionUseCaseContract {
  constructor(private readonly documentRevisionRepository: DocumentRevisionRepository) {}

  async execute(
    inspectDocumentRevisionRetentionDTO: InspectDocumentRevisionRetentionDTO,
  ): Promise<DocumentRevision | null> {
    const documentRevisionDocumentQO = { documentId: inspectDocumentRevisionRetentionDTO.documentId }

    return this.documentRevisionRepository.findByDocumentIdOrderByCreatedAtDesc(documentRevisionDocumentQO)
  }
}
