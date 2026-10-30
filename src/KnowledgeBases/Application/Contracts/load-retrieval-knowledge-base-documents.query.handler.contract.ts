import type { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import type { LoadRetrievalKnowledgeBaseDocumentsQuery } from '../Queries/load-retrieval-knowledge-base-documents.query.ts'

export abstract class LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract {
  abstract execute(
    loadRetrievalKnowledgeBaseDocumentsDTO: LoadRetrievalKnowledgeBaseDocumentsQuery,
  ): Promise<KnowledgeBaseDocument[]>
}
