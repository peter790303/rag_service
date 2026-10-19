import type { Document } from '../../../Domain/Document/document.ts'
import type { InspectDocumentRetentionDTO } from '../DataTransferObjects/document-retention-scope.dto.ts'

export abstract class InspectDocumentRetentionUseCaseContract {
  abstract execute(inspectDocumentRetentionDTO: InspectDocumentRetentionDTO): Promise<Document | null>
}
