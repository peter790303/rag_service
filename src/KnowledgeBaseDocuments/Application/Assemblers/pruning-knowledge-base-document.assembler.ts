import type { StartDocumentIndexPruningRetentionCommand } from '../../../DocumentIndexes/Application/Commands/start-document-index-pruning-retention.command.ts'
import type { LockDocumentRetentionParentsCommand } from '../../../Documents/Application/Commands/lock-document-retention-parents.command.ts'
import type { StartDocumentPruningRetentionCommand } from '../../../Documents/Application/Commands/start-document-pruning-retention.command.ts'
import type { ValidateKnowledgeBasePruningCommand } from '../../../KnowledgeBases/Application/Commands/validate-knowledge-base-pruning.command.ts'
import type { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import type { PruneKnowledgeBaseDocumentsCommand } from '../Commands/prune-knowledge-base-documents.command.ts'
import { KnowledgeBaseDocumentPruningStartedEvent } from '../Events/knowledge-base-document-pruning-started.event.ts'
import type { KnowledgeBaseDocumentKnowledgeBaseQO } from '../QueryObjects/knowledge-base-document.query-object.ts'
import type {
  KnowledgeBaseDocumentSourceQO,
  UpdateKnowledgeBaseDocumentActiveIndexQO,
} from '../QueryObjects/knowledge-base-document.query-object.ts'

export class PruningKnowledgeBaseDocumentAssembler {
  static toValidateKnowledgeBasePruningCommand(
    pruneKnowledgeBaseDocumentsCommand: PruneKnowledgeBaseDocumentsCommand,
  ): ValidateKnowledgeBasePruningCommand {
    return {
      projectId: pruneKnowledgeBaseDocumentsCommand.projectId,
      knowledgeBaseId: pruneKnowledgeBaseDocumentsCommand.knowledgeBaseId,
    }
  }

  static toKnowledgeBaseDocumentSourceQO(knowledgeBaseDocument: KnowledgeBaseDocument): KnowledgeBaseDocumentSourceQO {
    return {
      knowledgeBaseId: knowledgeBaseDocument.knowledgeBaseId,
      documentId: knowledgeBaseDocument.documentId,
    }
  }

  static toKnowledgeBaseDocumentPruningStartedEvent(
    knowledgeBaseDocument: KnowledgeBaseDocument,
  ): KnowledgeBaseDocumentPruningStartedEvent {
    return new KnowledgeBaseDocumentPruningStartedEvent(
      knowledgeBaseDocument.knowledgeBaseId,
      knowledgeBaseDocument.documentId,
    )
  }

  static toUpdateDetachedKnowledgeBaseDocumentQO(
    knowledgeBaseDocument: KnowledgeBaseDocument,
  ): UpdateKnowledgeBaseDocumentActiveIndexQO {
    return {
      knowledgeBaseId: knowledgeBaseDocument.knowledgeBaseId,
      documentId: knowledgeBaseDocument.documentId,
      activeDocumentIndexId: knowledgeBaseDocument.activeDocumentIndexId,
      updatedAt: knowledgeBaseDocument.updatedAt.nativeDate,
    }
  }

  static toStartDocumentIndexPruningRetentionCommand(
    documentIndexIds: ReadonlySet<string>,
    now: Date,
  ): StartDocumentIndexPruningRetentionCommand {
    return { documentIndexIds: [...documentIndexIds], now }
  }

  static toStartDocumentPruningRetentionCommand(
    knowledgeBaseDocument: KnowledgeBaseDocument,
    now: Date,
    lockedDocumentIds: readonly string[],
  ): StartDocumentPruningRetentionCommand {
    return { documentId: knowledgeBaseDocument.documentId, now, lockedDocumentIds }
  }

  static toLockDocumentRetentionParentsCommand(
    knowledgeBaseDocuments: readonly KnowledgeBaseDocument[],
  ): LockDocumentRetentionParentsCommand {
    return { documentIds: knowledgeBaseDocuments.map((candidate) => candidate.documentId) }
  }

  static toKnowledgeBaseDocumentKnowledgeBaseQO(
    pruneKnowledgeBaseDocumentsCommand: PruneKnowledgeBaseDocumentsCommand,
  ): KnowledgeBaseDocumentKnowledgeBaseQO {
    return { knowledgeBaseId: pruneKnowledgeBaseDocumentsCommand.knowledgeBaseId }
  }
}
