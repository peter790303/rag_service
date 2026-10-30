import type { Document } from '../../Domain/Entities/document.ts'
import type { PrepareDocumentForIndexRequestCommand } from '../Commands/prepare-document-for-index-request.command.ts'

export abstract class PrepareDocumentForIndexRequestCommandHandlerContract {
  abstract execute(sourceDocument: PrepareDocumentForIndexRequestCommand): Promise<Document>
}
