import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { InspectDocumentRevisionRetentionDTO } from '../DataTransferObjects/inspect-document-revision-retention.dto.ts'

export abstract class InspectDocumentRevisionRetentionUseCaseContract {
  abstract execute(
    inspectDocumentRevisionRetentionDTO: InspectDocumentRevisionRetentionDTO,
  ): Promise<DocumentRevision | null>
}
