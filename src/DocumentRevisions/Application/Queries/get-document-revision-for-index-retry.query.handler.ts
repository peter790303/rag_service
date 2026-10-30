import type { GetDocumentRevisionForIndexRetryQuery } from './get-document-revision-for-index-retry.query.ts'
import type { DocumentRevision } from '../../Domain/Entities/document-revision.ts'
import type { GetDocumentRevisionForIndexRetryQueryHandlerContract } from '../Contracts/get-document-revision-for-index-retry.query.handler.contract.ts'
import type { DocumentRevisionRepository } from '../Ports/Out/Repositories/document-revision.repository.ts'

/** Resolves retry content only when the revision belongs to the archived source. */
export class GetDocumentRevisionForIndexRetryQueryHandler implements GetDocumentRevisionForIndexRetryQueryHandlerContract {
  constructor(private readonly revisions: DocumentRevisionRepository) {}

  async execute(
    getDocumentRevisionForIndexRetryQuery: GetDocumentRevisionForIndexRetryQuery,
  ): Promise<DocumentRevision | null> {
    const documentRevisionDocumentScopeQO = {
      documentId: getDocumentRevisionForIndexRetryQuery.documentId,
      revisionId: getDocumentRevisionForIndexRetryQuery.revisionId,
    }
    const revision = await this.revisions.findByDocumentRevisionIdAndDocumentId(documentRevisionDocumentScopeQO)

    return revision
  }
}
