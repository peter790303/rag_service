import type { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'

export type CompleteKnowledgeBaseDocumentIndexingCommand = {
  readonly knowledgeBaseDocument: KnowledgeBaseDocument
  readonly generation: string
  readonly documentIndexId: string
}
