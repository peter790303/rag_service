import { ChunkDocumentIndexRequiredException } from '../../../Domain/Chunk/Exceptions/chunk-document-index-required.exception.ts'
import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { IndexChunkGarbageDTO } from '../../Chunks/DataTransferObjects/index-chunk-garbage.dto.ts'
import { InvalidIndexChunkGarbageInputException } from '../../Chunks/Exceptions/invalid-index-chunk-garbage-input.exception.ts'
import type { CollectDocumentRelationGarbageDTO } from '../../DocumentRelations/DataTransferObjects/document-relation-garbage.dto.ts'
import type { DocumentGarbageCollectionScopeDTO } from '../../Documents/DataTransferObjects/document-garbage-collection-scope.dto.ts'
import type { KnowledgeBaseDocumentRetentionDTO } from '../../KnowledgeBaseDocuments/DataTransferObjects/knowledge-base-document-retention.dto.ts'
import type { PlanDocumentIndexGarbageDTO } from '../DataTransferObjects/document-index-garbage.dto.ts'
import type { DocumentIndexRecordDTO } from '../DataTransferObjects/document-index-record.dto.ts'
import type {
  DocumentIndexGarbageCandidatesQueryObject,
  DocumentIndexIdQueryObject,
  DocumentIndexDocumentQueryObject,
  DocumentIndexRevisionQueryObject,
} from '../QueryObjects/document-index.query-object.ts'

export class DocumentIndexGarbageAssembler {
  static toDocumentIndexGarbageCandidatesQueryObject(
    planDocumentIndexGarbageDTO: PlanDocumentIndexGarbageDTO,
  ): DocumentIndexGarbageCandidatesQueryObject {
    return { cutoff: planDocumentIndexGarbageDTO.retentionCutoff }
  }

  static toDocumentIndexIdQueryObject(documentIndexId: string): DocumentIndexIdQueryObject {
    return { documentIndexId }
  }

  static toDocumentIndexDocumentQueryObject(documentId: string): DocumentIndexDocumentQueryObject {
    return { documentId }
  }

  static toDocumentIndexRevisionQueryObject(revisionId: string): DocumentIndexRevisionQueryObject {
    return { revisionId }
  }

  static toInspectKnowledgeBaseDocumentRetentionDTO(documentIndexId: string): KnowledgeBaseDocumentRetentionDTO {
    return { documentIndexId }
  }

  static toCollectDocumentRelationGarbageDTO(
    documentIndex: DocumentIndex,
    documentGarbageCollectionScopeDTO: DocumentGarbageCollectionScopeDTO,
  ): CollectDocumentRelationGarbageDTO {
    return {
      sourceIndexId: documentIndex.id,
      lockedDocumentIds: documentGarbageCollectionScopeDTO.lockedDocumentIds,
    }
  }

  static toIndexChunkGarbageDTO(
    documentIndexRecordDTO: DocumentIndexRecordDTO,
    documentGarbageCollectionScopeDTO: DocumentGarbageCollectionScopeDTO,
  ): IndexChunkGarbageDTO {
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
