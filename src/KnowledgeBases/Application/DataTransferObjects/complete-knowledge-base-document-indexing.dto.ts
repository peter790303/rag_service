import type { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'

export interface CompleteKnowledgeBaseDocumentIndexingDTO {
  readonly knowledgeBaseDocument: KnowledgeBaseDocument
  readonly generation: string
  readonly documentIndexId: string
}
