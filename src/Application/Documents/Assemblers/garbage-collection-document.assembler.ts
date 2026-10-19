import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { PlanDocumentIndexGarbageDTO } from '../../DocumentIndexes/DataTransferObjects/document-index-garbage.dto.ts'
import type { CollectDocumentIndexGarbageDTO } from '../../DocumentIndexes/DataTransferObjects/document-index-garbage.dto.ts'
import type {
  DocumentIndexFailureIdQueryObject,
  ExpiredDocumentIndexFailuresQueryObject,
} from '../../DocumentIndexes/QueryObjects/document-index-failure.query-object.ts'
import type { PlanDocumentRelationGarbageDTO } from '../../DocumentRelations/DataTransferObjects/document-relation-garbage.dto.ts'
import type { CollectDocumentRevisionGarbageDTO } from '../../DocumentRevisions/DataTransferObjects/document-revision-garbage.dto.ts'
import type { PlanDocumentRevisionGarbageDTO } from '../../DocumentRevisions/DataTransferObjects/document-revision-garbage.dto.ts'
import type { DocumentGarbageCollectionScopeDTO } from '../DataTransferObjects/document-garbage-collection-scope.dto.ts'
import type { LockDocumentRetentionParentsDTO } from '../DataTransferObjects/document-retention-scope.dto.ts'
import type { DocumentGarbageCandidatesQueryObject } from '../QueryObjects/document.query-object.ts'

export class GarbageCollectionDocumentAssembler {
  static toCollectDocumentIndexGarbageDTO(
    documentGarbageCollectionScopeDTO: DocumentGarbageCollectionScopeDTO,
    documentIndexes: readonly DocumentIndex[],
  ): CollectDocumentIndexGarbageDTO {
    return { scope: documentGarbageCollectionScopeDTO, candidates: documentIndexes }
  }

  static toCollectDocumentRevisionGarbageDTO(
    documentGarbageCollectionScopeDTO: DocumentGarbageCollectionScopeDTO,
    documentRevisionCandidatesDTO: readonly DocumentRevision[],
  ): CollectDocumentRevisionGarbageDTO {
    return {
      scope: {
        retentionCutoff: documentGarbageCollectionScopeDTO.retentionCutoff,
        lockedDocumentIds: documentGarbageCollectionScopeDTO.lockedDocumentIds,
      },
      candidates: documentRevisionCandidatesDTO,
    }
  }

  static toPlanDocumentRelationGarbageDTO(documentIndexes: readonly DocumentIndex[]): PlanDocumentRelationGarbageDTO {
    return { sourceIndexIds: documentIndexes.map((index) => index.id) }
  }

  static toPlanDocumentIndexGarbageDTO(retentionCutoff: Date): PlanDocumentIndexGarbageDTO {
    return { retentionCutoff }
  }

  static toExpiredDocumentIndexFailuresQO(retentionCutoff: Date): ExpiredDocumentIndexFailuresQueryObject {
    return { cutoff: retentionCutoff }
  }

  static toDocumentIndexFailureIdQO(failedJobId: string): DocumentIndexFailureIdQueryObject {
    return { failedJobId }
  }

  static toPlanDocumentRevisionGarbageDTO(retentionCutoff: Date): PlanDocumentRevisionGarbageDTO {
    return { retentionCutoff }
  }

  static toLockDocumentRetentionParentsDTO(documentIds: readonly string[]): LockDocumentRetentionParentsDTO {
    return { documentIds }
  }

  static toDocumentGarbageCandidatesQO(retentionCutoff: Date): DocumentGarbageCandidatesQueryObject {
    return { cutoff: retentionCutoff }
  }

  static toDocumentGarbageCollectionScopeDTO(
    retentionCutoff: Date,
    lockedDocumentIds: readonly string[],
  ): DocumentGarbageCollectionScopeDTO {
    return { retentionCutoff, lockedDocumentIds }
  }
}
