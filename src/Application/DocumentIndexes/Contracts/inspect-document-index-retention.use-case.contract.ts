import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { DocumentIndexRetentionDTO } from '../DataTransferObjects/document-index-garbage.dto.ts'

export abstract class InspectDocumentIndexRetentionUseCaseContract {
  abstract execute(documentIndexRetentionDTO: DocumentIndexRetentionDTO): Promise<DocumentIndex | null>
}
