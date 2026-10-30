import type { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import type { GetKnowledgeBaseDocumentIndexingStateQuery } from '../Queries/get-knowledge-base-document-indexing-state.query.ts'

export abstract class GetKnowledgeBaseDocumentIndexingStateQueryHandlerContract {
  abstract execute(
    getKnowledgeBaseDocumentIndexingStateQuery: GetKnowledgeBaseDocumentIndexingStateQuery,
  ): Promise<KnowledgeBaseDocument | null>
}
