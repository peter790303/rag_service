import type { DocumentIndexRetentionDto } from '../DataTransferObjects/document-index-garbage.dto.ts'

export abstract class InspectDocumentIndexRetentionUseCaseContract {
  abstract execute(documentIndexRetentionDTO: DocumentIndexRetentionDto): Promise<boolean>
}
