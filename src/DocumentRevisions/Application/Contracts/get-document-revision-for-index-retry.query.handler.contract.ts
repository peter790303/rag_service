import type { DocumentRevision } from '../../Domain/Entities/document-revision.ts'
import type { GetDocumentRevisionForIndexRetryQuery } from '../Queries/get-document-revision-for-index-retry.query.ts'

export abstract class GetDocumentRevisionForIndexRetryQueryHandlerContract {
  abstract execute(
    getDocumentRevisionForIndexRetryQuery: GetDocumentRevisionForIndexRetryQuery,
  ): Promise<DocumentRevision | null>
}
