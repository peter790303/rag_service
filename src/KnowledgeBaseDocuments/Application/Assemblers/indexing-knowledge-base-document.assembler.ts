import type { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import type {
  InsertKnowledgeBaseDocumentQO,
  UpdateKnowledgeBaseDocumentQO,
  KnowledgeBaseDocumentActivationQO,
} from '../QueryObjects/knowledge-base-document.query-object.ts'

export class IndexingKnowledgeBaseDocumentAssembler {
  static toKnowledgeBaseDocumentActivationQO(
    knowledgeBaseDocument: KnowledgeBaseDocument,
    expectedActiveDocumentIndexId: string | null,
    documentIndexId: string,
  ): KnowledgeBaseDocumentActivationQO {
    return {
      knowledgeBaseId: knowledgeBaseDocument.knowledgeBaseId,
      documentId: knowledgeBaseDocument.documentId,
      requestedGeneration: knowledgeBaseDocument.requestedGeneration,
      expectedActiveDocumentIndexId,
      documentIndexId,
      updatedAt: knowledgeBaseDocument.updatedAt.nativeDate,
    }
  }

  static toInsertKnowledgeBaseDocumentQO(knowledgeBaseDocument: KnowledgeBaseDocument): InsertKnowledgeBaseDocumentQO {
    return {
      knowledgeBaseId: knowledgeBaseDocument.knowledgeBaseId,
      documentId: knowledgeBaseDocument.documentId,
      requestedGeneration: knowledgeBaseDocument.requestedGeneration,
      activeDocumentIndexId: knowledgeBaseDocument.activeDocumentIndexId,
      isEntry: knowledgeBaseDocument.isEntry,
      alwaysIncludeFullContent: knowledgeBaseDocument.alwaysIncludeFullContent,
      updatedAt: knowledgeBaseDocument.updatedAt.nativeDate,
    }
  }

  static toUpdateKnowledgeBaseDocumentQO(knowledgeBaseDocument: KnowledgeBaseDocument): UpdateKnowledgeBaseDocumentQO {
    return {
      knowledgeBaseId: knowledgeBaseDocument.knowledgeBaseId,
      documentId: knowledgeBaseDocument.documentId,
      requestedGeneration: knowledgeBaseDocument.requestedGeneration,
      activeDocumentIndexId: knowledgeBaseDocument.activeDocumentIndexId,
      isEntry: knowledgeBaseDocument.isEntry,
      alwaysIncludeFullContent: knowledgeBaseDocument.alwaysIncludeFullContent,
      updatedAt: knowledgeBaseDocument.updatedAt.nativeDate,
    }
  }
}
