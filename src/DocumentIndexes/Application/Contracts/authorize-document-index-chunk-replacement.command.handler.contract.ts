import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import type { AuthorizeDocumentIndexChunkReplacementCommand } from '../Commands/authorize-document-index-chunk-replacement.command.ts'

/** Locks and authorizes replacing the plan for the committed document-index execution. */
export abstract class AuthorizeDocumentIndexChunkReplacementCommandHandlerContract {
  abstract execute(
    authorizeDocumentIndexChunkReplacementCommand: AuthorizeDocumentIndexChunkReplacementCommand,
  ): Promise<DocumentIndex | null>
}
