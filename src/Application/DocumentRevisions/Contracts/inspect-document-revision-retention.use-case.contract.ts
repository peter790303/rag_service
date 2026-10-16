import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { InspectDocumentRetentionDto } from '../../Documents/DataTransferObjects/document-retention-scope.dto.ts'

export abstract class InspectDocumentRevisionRetentionUseCaseContract {
  abstract execute(inspectDocumentRetentionDTO: InspectDocumentRetentionDto): Promise<DocumentRevision | null>
}
