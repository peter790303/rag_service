import type { Document } from '../../Domain/Entities/document.ts'
import type { ReserveDocumentForIndexingCommand } from '../Commands/reserve-document-for-indexing.command.ts'

export abstract class ReserveDocumentForIndexingCommandHandlerContract {
  abstract execute(reserveDocumentForIndexingCommand: ReserveDocumentForIndexingCommand): Promise<Document | null>
}
