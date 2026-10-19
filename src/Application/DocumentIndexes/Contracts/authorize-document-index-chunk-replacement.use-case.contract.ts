import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { AuthorizeDocumentIndexChunkReplacementInputDTO } from '../DataTransferObjects/authorize-document-index-chunk-replacement-input.dto.ts'

/** Locks and authorizes replacing the plan for the committed document-index execution. */
export abstract class AuthorizeDocumentIndexChunkReplacementUseCaseContract {
  abstract execute(
    authorizeDocumentIndexChunkReplacementDTO: AuthorizeDocumentIndexChunkReplacementInputDTO,
  ): Promise<DocumentIndex | null>
}
