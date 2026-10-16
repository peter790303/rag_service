import type { Document } from '../../../Domain/Document/document.ts'
import type { InspectDocumentRetentionDto } from '../DataTransferObjects/document-retention-scope.dto.ts'

export abstract class InspectDocumentRetentionUseCaseContract {
  abstract execute(inspectDocumentRetentionDTO: InspectDocumentRetentionDto): Promise<Document | null>
}
