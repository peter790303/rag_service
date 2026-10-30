import type { ReserveDocumentForIndexingCommand } from './reserve-document-for-indexing.command.ts'
import type { Document } from '../../Domain/Entities/document.ts'
import type { ReserveDocumentForIndexingCommandHandlerContract } from '../Contracts/reserve-document-for-indexing.command.handler.contract.ts'
import type { DocumentRepository } from '../Ports/Out/Repositories/document.repository.ts'

/** Holds the source row before indexing takes knowledgeBaseDocument or job locks. */
export class ReserveDocumentForIndexingCommandHandler implements ReserveDocumentForIndexingCommandHandlerContract {
  constructor(private readonly documents: DocumentRepository) {}

  async execute(reserveDocumentForIndexingCommand: ReserveDocumentForIndexingCommand): Promise<Document | null> {
    const documentIdQO = { documentId: reserveDocumentForIndexingCommand.documentId }
    const document = reserveDocumentForIndexingCommand.skipLocked
      ? await this.documents.lockByDocumentIdSkipLocked(documentIdQO)
      : await this.documents.lockByDocumentId(documentIdQO)

    return document
  }
}
