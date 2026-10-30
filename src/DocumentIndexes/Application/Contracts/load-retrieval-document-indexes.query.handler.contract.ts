import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import type { LoadRetrievalDocumentIndexesQuery } from '../Queries/load-retrieval-document-indexes.query.ts'

export abstract class LoadRetrievalDocumentIndexesQueryHandlerContract {
  abstract execute(loadRetrievalDocumentIndexesDTO: LoadRetrievalDocumentIndexesQuery): Promise<DocumentIndex[]>
}
