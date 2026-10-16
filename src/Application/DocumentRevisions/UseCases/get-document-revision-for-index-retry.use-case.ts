import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { DocumentRevisionRepository } from '../Contracts/document-revision.repository.ts'
import type { GetDocumentRevisionForIndexRetryUseCaseContract } from '../Contracts/get-document-revision-for-index-retry.use-case.contract.ts'

/** Resolves retry content only when the revision belongs to the archived source. */
export class GetDocumentRevisionForIndexRetryUseCase implements GetDocumentRevisionForIndexRetryUseCaseContract {
  constructor(private readonly revisions: DocumentRevisionRepository) {}

  async execute(getDocumentRevisionForIndexRetryDTO: {
    readonly documentId: string
    readonly revisionId: string
  }): Promise<DocumentRevision | null> {
    const documentRevisionDocumentScopeQO = {
      documentId: getDocumentRevisionForIndexRetryDTO.documentId,
      revisionId: getDocumentRevisionForIndexRetryDTO.revisionId,
    }
    const revision = await this.revisions.findByDocumentRevisionIdAndDocumentId(documentRevisionDocumentScopeQO)

    return revision
  }
}
