import type { DocumentRevision } from '../../Domain/Entities/document-revision.ts'
import type { LoadRetrievalDocumentRevisionsQuery } from '../Queries/load-retrieval-document-revisions.query.ts'

export abstract class LoadRetrievalDocumentRevisionsQueryHandlerContract {
  abstract execute(loadRetrievalDocumentRevisionsDTO: LoadRetrievalDocumentRevisionsQuery): Promise<DocumentRevision[]>
}
