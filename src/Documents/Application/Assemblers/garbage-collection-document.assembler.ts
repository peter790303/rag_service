import type { CollectDocumentIndexGarbageCommand } from '../../../DocumentIndexes/Application/Commands/collect-document-index-garbage.command.ts'
import type { PlanDocumentIndexGarbageQuery } from '../../../DocumentIndexes/Application/Queries/plan-document-index-garbage.query.ts'
import type { DocumentIndex } from '../../../DocumentIndexes/Domain/Entities/document-index.ts'
import type { PlanDocumentRelationGarbageQuery } from '../../../DocumentRelations/Application/Queries/plan-document-relation-garbage.query.ts'
import type { CollectDocumentRevisionGarbageCommand } from '../../../DocumentRevisions/Application/Commands/collect-document-revision-garbage.command.ts'
import type { PlanDocumentRevisionGarbageQuery } from '../../../DocumentRevisions/Application/Queries/plan-document-revision-garbage.query.ts'
import type { DocumentRevision } from '../../../DocumentRevisions/Domain/Entities/document-revision.ts'
import type { LockDocumentRetentionParentsCommand } from '../Commands/lock-document-retention-parents.command.ts'
import type { DocumentGarbageCollectionScopeDTO } from '../DataTransferObjects/document-garbage-collection-scope.dto.ts'
import type { DocumentGarbageCandidatesQO } from '../QueryObjects/document.query-object.ts'

export class GarbageCollectionDocumentAssembler {
  static toCollectDocumentIndexGarbageCommand(
    documentGarbageCollectionScopeDTO: DocumentGarbageCollectionScopeDTO,
    documentIndexes: readonly DocumentIndex[],
  ): CollectDocumentIndexGarbageCommand {
    return {
      scope: {
        retentionCutoff: documentGarbageCollectionScopeDTO.retentionCutoff,
        lockedDocumentIds: documentGarbageCollectionScopeDTO.lockedDocumentIds,
      },
      candidates: documentIndexes,
    }
  }

  static toCollectDocumentRevisionGarbageCommand(
    documentGarbageCollectionScopeDTO: DocumentGarbageCollectionScopeDTO,
    documentRevisionCandidatesDTO: readonly DocumentRevision[],
  ): CollectDocumentRevisionGarbageCommand {
    return {
      scope: {
        retentionCutoff: documentGarbageCollectionScopeDTO.retentionCutoff,
        lockedDocumentIds: documentGarbageCollectionScopeDTO.lockedDocumentIds,
      },
      candidates: documentRevisionCandidatesDTO,
    }
  }

  static toPlanDocumentRelationGarbageQuery(
    documentIndexes: readonly DocumentIndex[],
  ): PlanDocumentRelationGarbageQuery {
    return { sourceIndexIds: documentIndexes.map((index) => index.id) }
  }

  static toPlanDocumentIndexGarbageQuery(retentionCutoff: Date): PlanDocumentIndexGarbageQuery {
    return { retentionCutoff }
  }

  static toPlanDocumentRevisionGarbageQuery(retentionCutoff: Date): PlanDocumentRevisionGarbageQuery {
    return { retentionCutoff }
  }

  static toLockDocumentRetentionParentsCommand(documentIds: readonly string[]): LockDocumentRetentionParentsCommand {
    return { documentIds }
  }

  static toDocumentGarbageCandidatesQO(retentionCutoff: Date): DocumentGarbageCandidatesQO {
    return { cutoff: retentionCutoff }
  }

  static toDocumentGarbageCollectionScopeDTO(
    retentionCutoff: Date,
    lockedDocumentIds: readonly string[],
  ): DocumentGarbageCollectionScopeDTO {
    return { retentionCutoff, lockedDocumentIds }
  }
}
