import type { Document } from '../../../Domain/Document/document.ts'
import type { SourceDocumentDto } from '../DataTransferObjects/source-document.dto.ts'

export abstract class PrepareDocumentForIndexRequestUseCaseContract {
  abstract execute(sourceDocument: SourceDocumentDto): Promise<Document>
}
