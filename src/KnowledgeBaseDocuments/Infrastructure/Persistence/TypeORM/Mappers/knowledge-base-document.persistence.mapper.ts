import { KnowledgeBaseDocument } from '../../../../Domain/Entities/knowledge-base-document.ts'
import type { KnowledgeBaseDocumentModel } from '../Models/knowledge-base-document.model.ts'

export class KnowledgeBaseDocumentPersistenceMapper {
  static toKnowledgeBaseDocument(knowledgeBaseDocumentModel: KnowledgeBaseDocumentModel): KnowledgeBaseDocument {
    return new KnowledgeBaseDocument({
      knowledgeBaseId: knowledgeBaseDocumentModel.knowledgeBaseId,
      documentId: knowledgeBaseDocumentModel.documentId,
      requestedGeneration: knowledgeBaseDocumentModel.requestedGeneration,
      activeDocumentIndexId: knowledgeBaseDocumentModel.activeDocumentIndexId,
      isEntry: knowledgeBaseDocumentModel.isEntry,
      alwaysIncludeFullContent: knowledgeBaseDocumentModel.alwaysIncludeFullContent,
      updatedAt: knowledgeBaseDocumentModel.updatedAt,
    })
  }
}
