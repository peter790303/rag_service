import type { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'

export interface SaveKnowledgeBaseDocumentIndexRequestDTO {
  readonly knowledgeBaseDocument: KnowledgeBaseDocument
  readonly generation: string
  readonly activeDocumentIndexId: string | null
}
