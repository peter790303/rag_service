import type { Document } from '../../../Domain/Document/document.ts'
import type { SourceDocumentDTO } from '../DataTransferObjects/source-document.dto.ts'

export abstract class PrepareDocumentForIndexRequestUseCaseContract {
  abstract execute(sourceDocument: SourceDocumentDTO): Promise<Document>
}
