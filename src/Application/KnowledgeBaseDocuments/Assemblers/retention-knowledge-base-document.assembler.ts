import type {
  KnowledgeBaseDocumentDocumentQueryObject,
  KnowledgeBaseDocumentActiveIndexQueryObject,
} from '../QueryObjects/knowledge-base-document.query-object.ts'

export class RetentionKnowledgeBaseDocumentAssembler {
  static toKnowledgeBaseDocumentDocumentQO(documentId: string): KnowledgeBaseDocumentDocumentQueryObject {
    return { documentId }
  }

  static toKnowledgeBaseDocumentActiveIndexQO(documentIndexId: string): KnowledgeBaseDocumentActiveIndexQueryObject {
    return { documentIndexId }
  }
}
