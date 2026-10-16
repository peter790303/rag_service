import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { PlanDocumentIndexGarbageDto } from '../../DocumentIndexes/DataTransferObjects/document-index-garbage.dto.ts'
import type {
  CollectDocumentIndexGarbageDto,
  DocumentIndexGarbagePlanDto,
} from '../../DocumentIndexes/DataTransferObjects/document-index-garbage.dto.ts'
import type { DocumentIndexRecordDto } from '../../DocumentIndexes/DataTransferObjects/document-index-record.dto.ts'
import type { PlanDocumentRelationGarbageDto } from '../../DocumentRelations/DataTransferObjects/document-relation-garbage.dto.ts'
import type { CollectDocumentRevisionGarbageDto } from '../../DocumentRevisions/DataTransferObjects/document-revision-garbage.dto.ts'
import type { PlanDocumentRevisionGarbageDto } from '../../DocumentRevisions/DataTransferObjects/document-revision-garbage.dto.ts'
import type { DocumentGarbageCollectionScopeDto } from '../DataTransferObjects/document-garbage-collection-scope.dto.ts'
import type { LockDocumentRetentionParentsDto } from '../DataTransferObjects/document-retention-scope.dto.ts'
import type { DocumentGarbageCandidatesQueryObject } from '../QueryObjects/document.query-object.ts'

export class GarbageCollectionDocumentAssembler {
  static toCollectDocumentIndexGarbageDTO(
    documentGarbageCollectionScopeDTO: DocumentGarbageCollectionScopeDto,
    documentIndexGarbagePlanDTO: DocumentIndexGarbagePlanDto,
  ): CollectDocumentIndexGarbageDto {
    return { scope: documentGarbageCollectionScopeDTO, plan: documentIndexGarbagePlanDTO }
  }

  static toCollectDocumentRevisionGarbageDTO(
    documentGarbageCollectionScopeDTO: DocumentGarbageCollectionScopeDto,
    documentRevisionCandidatesDTO: readonly DocumentRevision[],
  ): CollectDocumentRevisionGarbageDto {
    return { scope: documentGarbageCollectionScopeDTO, candidates: documentRevisionCandidatesDTO }
  }

  static toPlanDocumentRelationGarbageDTO(
    documentIndexRecordsDTO: readonly DocumentIndexRecordDto[],
  ): PlanDocumentRelationGarbageDto {
    return { sourceIndexIds: documentIndexRecordsDTO.map((index) => index.id) }
  }

  static toPlanDocumentIndexGarbageDTO(retentionCutoff: Date): PlanDocumentIndexGarbageDto {
    return { retentionCutoff }
  }

  static toPlanDocumentRevisionGarbageDTO(retentionCutoff: Date): PlanDocumentRevisionGarbageDto {
    return { retentionCutoff }
  }

  static toLockDocumentRetentionParentsDTO(documentIds: readonly string[]): LockDocumentRetentionParentsDto {
    return { documentIds }
  }

  static toDocumentGarbageCandidatesQO(retentionCutoff: Date): DocumentGarbageCandidatesQueryObject {
    return { cutoff: retentionCutoff }
  }

  static toDocumentGarbageCollectionScopeDTO(
    retentionCutoff: Date,
    lockedDocumentIds: readonly string[],
  ): DocumentGarbageCollectionScopeDto {
    return { retentionCutoff, lockedDocumentIds }
  }
}
