import type { KnowledgeBaseDocument } from '../../../Domain/Entities/knowledge-base-document.ts'

export class PruneKnowledgeBaseDocumentsResource {
  static toPruneKnowledgeBaseDocumentsResource(knowledgeBaseDocuments: readonly KnowledgeBaseDocument[]): {
    pruned: number
  } {
    return { pruned: knowledgeBaseDocuments.length }
  }
}
