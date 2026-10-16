import type { DocumentIndexRetentionDto } from '../../DocumentIndexes/DataTransferObjects/document-index-garbage.dto.ts'
import type { PlanDocumentRevisionGarbageDto } from '../DataTransferObjects/document-revision-garbage.dto.ts'
import type {
  DocumentRevisionIdQueryObject,
  DocumentRevisionDocumentQueryObject,
  DocumentRevisionGarbageCandidatesQueryObject,
} from '../QueryObjects/document-revision.query-object.ts'

export class GarbageDocumentRevisionAssembler {
  static toDocumentRevisionGarbageCandidatesQueryObject(
    planDocumentRevisionGarbageDTO: PlanDocumentRevisionGarbageDto,
  ): DocumentRevisionGarbageCandidatesQueryObject {
    return { cutoff: planDocumentRevisionGarbageDTO.retentionCutoff }
  }

  static toDocumentRevisionIdQueryObject(revisionId: string): DocumentRevisionIdQueryObject {
    return { revisionId }
  }

  static toDocumentRevisionDocumentQueryObject(documentId: string): DocumentRevisionDocumentQueryObject {
    return { documentId }
  }

  static toDocumentIndexRetentionDTO(revisionId: string): DocumentIndexRetentionDto {
    return { revisionId }
  }
}
