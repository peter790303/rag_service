import type { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import type { StartDocumentIndexPruningRetentionDTO } from '../../DocumentIndexes/DataTransferObjects/document-index-garbage.dto.ts'
import type { LockDocumentRetentionParentsDTO } from '../../Documents/DataTransferObjects/document-retention-scope.dto.ts'
import type { StartDocumentPruningRetentionDTO } from '../../Documents/DataTransferObjects/start-document-pruning-retention.dto.ts'
import type { KnowledgeBasePruningScopeDTO } from '../../KnowledgeBases/DataTransferObjects/knowledge-base-pruning-scope.dto.ts'
import type { PruneKnowledgeBaseDocumentsDTO } from '../DataTransferObjects/prune-knowledge-base-documents.dto.ts'
import { KnowledgeBaseDocumentPruningStartedEvent } from '../Events/knowledge-base-document-pruning-started.event.ts'
import type { KnowledgeBaseDocumentKnowledgeBaseQueryObject } from '../QueryObjects/knowledge-base-document.query-object.ts'
import type {
  KnowledgeBaseDocumentSourceQueryObject,
  UpdateKnowledgeBaseDocumentActiveIndexQueryObject,
} from '../QueryObjects/knowledge-base-document.query-object.ts'

export class PruningKnowledgeBaseDocumentAssembler {
  static toKnowledgeBasePruningScopeDTO(
    pruneKnowledgeBaseDocumentsDTO: PruneKnowledgeBaseDocumentsDTO,
  ): KnowledgeBasePruningScopeDTO {
    return {
      projectId: pruneKnowledgeBaseDocumentsDTO.projectId,
      knowledgeBaseId: pruneKnowledgeBaseDocumentsDTO.knowledgeBaseId,
    }
  }

  static toKnowledgeBaseDocumentSourceQO(
    knowledgeBaseDocument: KnowledgeBaseDocument,
  ): KnowledgeBaseDocumentSourceQueryObject {
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
  ): UpdateKnowledgeBaseDocumentActiveIndexQueryObject {
    return {
      knowledgeBaseId: knowledgeBaseDocument.knowledgeBaseId,
      documentId: knowledgeBaseDocument.documentId,
      activeDocumentIndexId: knowledgeBaseDocument.activeDocumentIndexId,
      updatedAt: knowledgeBaseDocument.updatedAt.nativeDate,
    }
  }

  static toStartDocumentIndexPruningRetentionDTO(
    documentIndexIds: ReadonlySet<string>,
    now: Date,
  ): StartDocumentIndexPruningRetentionDTO {
    return { documentIndexIds: [...documentIndexIds], now }
  }

  static toStartDocumentPruningRetentionDTO(
    knowledgeBaseDocument: KnowledgeBaseDocument,
    now: Date,
    lockedDocumentIds: readonly string[],
  ): StartDocumentPruningRetentionDTO {
    return { documentId: knowledgeBaseDocument.documentId, now, lockedDocumentIds }
  }

  static toLockDocumentRetentionParentsDTO(
    knowledgeBaseDocuments: readonly KnowledgeBaseDocument[],
  ): LockDocumentRetentionParentsDTO {
    return { documentIds: knowledgeBaseDocuments.map((candidate) => candidate.documentId) }
  }

  static toKnowledgeBaseDocumentKnowledgeBaseQO(
    pruneKnowledgeBaseDocumentsDTO: PruneKnowledgeBaseDocumentsDTO,
  ): KnowledgeBaseDocumentKnowledgeBaseQueryObject {
    return { knowledgeBaseId: pruneKnowledgeBaseDocumentsDTO.knowledgeBaseId }
  }
}
