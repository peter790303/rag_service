import { ReadDocumentIndexAssembler } from './read-document-index.assembler.ts'
import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { IndexChunkGarbageDto } from '../../Chunks/DataTransferObjects/index-chunk-garbage.dto.ts'
import type { CollectDocumentRelationGarbageDto } from '../../DocumentRelations/DataTransferObjects/document-relation-garbage.dto.ts'
import type { DocumentGarbageCollectionResultDto } from '../../Documents/DataTransferObjects/document-garbage-collection-scope.dto.ts'
import type { DocumentGarbageCollectionScopeDto } from '../../Documents/DataTransferObjects/document-garbage-collection-scope.dto.ts'
import type { MembershipRetentionDto } from '../../Memberships/DataTransferObjects/membership-retention.dto.ts'
import type {
  DocumentIndexGarbagePlanDto,
  PlanDocumentIndexGarbageDto,
} from '../DataTransferObjects/document-index-garbage.dto.ts'
import type { DocumentIndexRecordDto } from '../DataTransferObjects/document-index-record.dto.ts'
import type { ExpiredDocumentIndexFailureDto } from '../DataTransferObjects/expired-document-index-failure.dto.ts'
import type { DocumentIndexFailureIdQueryObject } from '../QueryObjects/document-index-failure.query-object.ts'
import type {
  DocumentIndexGarbageCandidatesQueryObject,
  DocumentIndexIdQueryObject,
  DocumentIndexDocumentQueryObject,
  DocumentIndexRevisionQueryObject,
} from '../QueryObjects/document-index.query-object.ts'

export class DocumentIndexGarbageAssembler {
  static toDocumentIndexGarbageCandidatesQueryObject(
    planDocumentIndexGarbageDTO: PlanDocumentIndexGarbageDto,
  ): DocumentIndexGarbageCandidatesQueryObject {
    return { cutoff: planDocumentIndexGarbageDTO.retentionCutoff }
  }

  static toDocumentIndexGarbagePlanDTO(
    failedJobs: ExpiredDocumentIndexFailureDto[],
    restoredDocumentIndexes: DocumentIndex[],
  ): DocumentIndexGarbagePlanDto {
    return {
      failedJobs: failedJobs.sort((left, right) => left.failedJobId.localeCompare(right.failedJobId)),
      indexes: restoredDocumentIndexes
        .map(ReadDocumentIndexAssembler.toDocumentIndexRecordDTO)
        .sort((left, right) => left.id.localeCompare(right.id)),
    }
  }

  static toDocumentGarbageCollectionResultDTO(
    deleted: number,
    changedDocumentIds: ReadonlySet<string>,
  ): DocumentGarbageCollectionResultDto {
    return { deleted, changedDocumentIds: [...changedDocumentIds] }
  }

  static toDocumentIndexFailureIdQueryObject(failedJobId: string): DocumentIndexFailureIdQueryObject {
    return { failedJobId }
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

  static toInspectMembershipRetentionDTO(documentIndexId: string): MembershipRetentionDto {
    return { documentIndexId }
  }

  static toCollectDocumentRelationGarbageDTO(
    documentIndexRecordDTO: DocumentIndexRecordDto,
    documentGarbageCollectionScopeDTO: DocumentGarbageCollectionScopeDto,
  ): CollectDocumentRelationGarbageDto {
    return {
      sourceIndexId: documentIndexRecordDTO.id,
      lockedDocumentIds: documentGarbageCollectionScopeDTO.lockedDocumentIds,
    }
  }

  static toIndexChunkGarbageDTO(
    documentIndexRecordDTO: DocumentIndexRecordDto,
    documentGarbageCollectionScopeDTO: DocumentGarbageCollectionScopeDto,
  ): IndexChunkGarbageDto {
    return {
      documentIndexId: documentIndexRecordDTO.id,
      documentId: documentIndexRecordDTO.documentId,
      unreferencedSince: documentIndexRecordDTO.unreferencedSince,
      retentionCutoff: documentGarbageCollectionScopeDTO.retentionCutoff,
      lockedDocumentIds: documentGarbageCollectionScopeDTO.lockedDocumentIds,
    }
  }
}
