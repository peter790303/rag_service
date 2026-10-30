import type { DocumentRelation } from '../../Domain/Entities/document-relation.ts'
import type { LoadRetrievalDocumentRelationsQuery } from '../Queries/load-retrieval-document-relations.query.ts'

export abstract class LoadRetrievalDocumentRelationsQueryHandlerContract {
  abstract execute(
    loadRetrievalDocumentRelationsQuery: LoadRetrievalDocumentRelationsQuery,
  ): Promise<DocumentRelation[]>
}
