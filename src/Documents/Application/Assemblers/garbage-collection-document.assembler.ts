import type { PlanDocumentIndexGarbageDTO } from '../../../DocumentIndexes/Application/DataTransferObjects/document-index-garbage.dto.ts'
import type { CollectDocumentIndexGarbageDTO } from '../../../DocumentIndexes/Application/DataTransferObjects/document-index-garbage.dto.ts'
import type {
  DocumentIndexFailureIdQueryObject,
  ExpiredDocumentIndexFailuresQueryObject,
} from '../../../DocumentIndexes/Application/QueryObjects/document-index-failure.query-object.ts'
import type { DocumentIndex } from '../../../DocumentIndexes/Domain/Entities/document-index.ts'
import type { DocumentRevision } from '../../Domain/Entities/document-revision.ts'
import type { DocumentGarbageCollectionScopeDTO } from '../DataTransferObjects/document-garbage-collection-scope.dto.ts'
import type { PlanDocumentRelationGarbageDTO } from '../DataTransferObjects/document-relation-garbage.dto.ts'
import type { LockDocumentRetentionParentsDTO } from '../DataTransferObjects/document-retention-scope.dto.ts'
import type { CollectDocumentRevisionGarbageDTO } from '../DataTransferObjects/document-revision-garbage.dto.ts'
import type { PlanDocumentRevisionGarbageDTO } from '../DataTransferObjects/document-revision-garbage.dto.ts'
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
