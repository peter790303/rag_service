import type { CompleteKnowledgeBaseDocumentIndexingCommand } from '../../../KnowledgeBaseDocuments/Application/Commands/complete-knowledge-base-document-indexing.command.ts'
import type { SaveKnowledgeBaseDocumentIndexRequestCommand } from '../../../KnowledgeBaseDocuments/Application/Commands/save-knowledge-base-document-index-request.command.ts'
import type { KnowledgeBaseDocument } from '../../../KnowledgeBaseDocuments/Domain/Entities/knowledge-base-document.ts'

export class IndexingKnowledgeBaseDocumentCommandAssembler {
  static toSaveCommand(
    document: KnowledgeBaseDocument,
    generation: string,
    activeDocumentIndexId: string | null,
  ): SaveKnowledgeBaseDocumentIndexRequestCommand {
    return { knowledgeBaseDocument: this.toSnapshot(document), generation, activeDocumentIndexId }
  }

  static toCompleteCommand(
    document: KnowledgeBaseDocument,
    generation: string,
    documentIndexId: string,
  ): CompleteKnowledgeBaseDocumentIndexingCommand {
    return { knowledgeBaseDocument: this.toSnapshot(document), generation, documentIndexId }
  }

  private static toSnapshot(document: KnowledgeBaseDocument) {
    return {
      knowledgeBaseId: document.knowledgeBaseId,
      documentId: document.documentId,
      requestedGeneration: document.requestedGeneration,
      activeDocumentIndexId: document.activeDocumentIndexId,
      isEntry: document.isEntry,
      alwaysIncludeFullContent: document.alwaysIncludeFullContent,
      updatedAt: document.updatedAt.nativeDate,
    }
  }
}
