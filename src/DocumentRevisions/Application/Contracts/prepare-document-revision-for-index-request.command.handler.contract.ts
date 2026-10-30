import type { DocumentRevision } from '../../Domain/Entities/document-revision.ts'
import type { PrepareDocumentRevisionForIndexRequestCommand } from '../Commands/prepare-document-revision-for-index-request.command.ts'

export abstract class PrepareDocumentRevisionForIndexRequestCommandHandlerContract {
  abstract execute(
    prepareDocumentRevisionForIndexRequestCommand: PrepareDocumentRevisionForIndexRequestCommand,
  ): Promise<DocumentRevision>
}
