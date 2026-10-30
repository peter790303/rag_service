import type {
  KnowledgeBaseDocumentDocumentQO,
  KnowledgeBaseDocumentActiveIndexQO,
} from '../QueryObjects/knowledge-base-document.query-object.ts'

export class RetentionKnowledgeBaseDocumentAssembler {
  static toKnowledgeBaseDocumentDocumentQO(documentId: string): KnowledgeBaseDocumentDocumentQO {
    return { documentId }
  }

  static toKnowledgeBaseDocumentActiveIndexQO(documentIndexId: string): KnowledgeBaseDocumentActiveIndexQO {
    return { documentIndexId }
  }
}
