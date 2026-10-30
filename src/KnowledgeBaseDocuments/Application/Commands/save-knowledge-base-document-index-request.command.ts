import type { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'

export type SaveKnowledgeBaseDocumentIndexRequestCommand = {
  readonly knowledgeBaseDocument: KnowledgeBaseDocument
  readonly generation: string
  readonly activeDocumentIndexId: string | null
}
