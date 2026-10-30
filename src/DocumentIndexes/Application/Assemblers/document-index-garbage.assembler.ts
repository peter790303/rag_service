import type { CollectIndexChunkGarbageCommand } from '../../../Chunks/Application/Commands/collect-index-chunk-garbage.command.ts'
import { InvalidIndexChunkGarbageInputException } from '../../../Chunks/Application/Exceptions/invalid-index-chunk-garbage-input.exception.ts'
import { ChunkDocumentIndexRequiredException } from '../../../Chunks/Domain/Exceptions/chunk-document-index-required.exception.ts'
import type { CollectDocumentRelationGarbageCommand } from '../../../DocumentRelations/Application/Commands/collect-document-relation-garbage.command.ts'
import type { DocumentGarbageCollectionScopeDTO } from '../../../Documents/Application/DTOs/document-garbage-collection-scope.dto.ts'
import type { InspectKnowledgeBaseDocumentRetentionQuery } from '../../../KnowledgeBaseDocuments/Application/Queries/inspect-knowledge-base-document-retention.query.ts'
import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import type { DocumentIndexRecordDTO } from '../DTOs/document-index-record.dto.ts'
import type { PlanDocumentIndexGarbageQuery } from '../Queries/plan-document-index-garbage.query.ts'
import type {
  DocumentIndexGarbageCandidatesQO,
  DocumentIndexIdQO,
  DocumentIndexDocumentQO,
  DocumentIndexRevisionQO,
} from '../QueryObjects/document-index.query-object.ts'

export class DocumentIndexGarbageAssembler {
  static toDocumentIndexGarbageCandidatesQO(
    planDocumentIndexGarbageQuery: PlanDocumentIndexGarbageQuery,
  ): DocumentIndexGarbageCandidatesQO {
    return { cutoff: planDocumentIndexGarbageQuery.retentionCutoff }
  }

  static toDocumentIndexIdQO(documentIndexId: string): DocumentIndexIdQO {
    return { documentIndexId }
  }

  static toDocumentIndexDocumentQO(documentId: string): DocumentIndexDocumentQO {
    return { documentId }
  }

  static toDocumentIndexRevisionQO(revisionId: string): DocumentIndexRevisionQO {
    return { revisionId }
  }

  static toInspectKnowledgeBaseDocumentRetentionQuery(
    documentIndexId: string,
  ): InspectKnowledgeBaseDocumentRetentionQuery {
    return { documentIndexId }
  }

  static toCollectDocumentRelationGarbageCommand(
    documentIndex: DocumentIndex,
    documentGarbageCollectionScopeDTO: DocumentGarbageCollectionScopeDTO,
  ): CollectDocumentRelationGarbageCommand {
    return {
      sourceIndexId: documentIndex.id,
      lockedDocumentIds: documentGarbageCollectionScopeDTO.lockedDocumentIds,
    }
  }

  static toCollectIndexChunkGarbageCommand(
    documentIndexRecordDTO: DocumentIndexRecordDTO,
    documentGarbageCollectionScopeDTO: DocumentGarbageCollectionScopeDTO,
  ): CollectIndexChunkGarbageCommand {
    if (typeof documentIndexRecordDTO?.id !== 'string' || !documentIndexRecordDTO.id.trim())
      throw new ChunkDocumentIndexRequiredException()

    if (typeof documentIndexRecordDTO.documentId !== 'string' || !documentIndexRecordDTO.documentId.trim())
      throw new InvalidIndexChunkGarbageInputException('documentId')

    if (
      !Array.isArray(documentGarbageCollectionScopeDTO?.lockedDocumentIds) ||
      !Array.from(documentGarbageCollectionScopeDTO.lockedDocumentIds).every(
        (documentId) => typeof documentId === 'string' && documentId.trim().length > 0,
      )
    )
      throw new InvalidIndexChunkGarbageInputException('lockedDocumentIds')

    if (
      !(documentGarbageCollectionScopeDTO.retentionCutoff instanceof Date) ||
      !Number.isFinite(documentGarbageCollectionScopeDTO.retentionCutoff.getTime())
    )
      throw new InvalidIndexChunkGarbageInputException('retentionCutoff')

    if (
      documentIndexRecordDTO.unreferencedSince !== null &&
      (!(documentIndexRecordDTO.unreferencedSince instanceof Date) ||
        !Number.isFinite(documentIndexRecordDTO.unreferencedSince.getTime()))
    )
      throw new InvalidIndexChunkGarbageInputException('unreferencedSince')

    return {
      documentIndexId: documentIndexRecordDTO.id,
      documentId: documentIndexRecordDTO.documentId,
      unreferencedSince: documentIndexRecordDTO.unreferencedSince,
      retentionCutoff: documentGarbageCollectionScopeDTO.retentionCutoff,
      lockedDocumentIds: documentGarbageCollectionScopeDTO.lockedDocumentIds,
    }
  }
}
