import type { DocumentIndexRetentionDTO } from '../../../DocumentIndexes/Application/DataTransferObjects/document-index-garbage.dto.ts'
import type { PlanDocumentRevisionGarbageDTO } from '../DataTransferObjects/document-revision-garbage.dto.ts'
import type {
  DocumentRevisionIdQueryObject,
  DocumentRevisionDocumentQueryObject,
  DocumentRevisionGarbageCandidatesQueryObject,
} from '../QueryObjects/document-revision.query-object.ts'

export class GarbageDocumentRevisionAssembler {
  static toDocumentRevisionGarbageCandidatesQueryObject(
    planDocumentRevisionGarbageDTO: PlanDocumentRevisionGarbageDTO,
  ): DocumentRevisionGarbageCandidatesQueryObject {
    return { cutoff: planDocumentRevisionGarbageDTO.retentionCutoff }
  }

  static toDocumentRevisionIdQueryObject(revisionId: string): DocumentRevisionIdQueryObject {
    return { revisionId }
  }

  static toDocumentRevisionDocumentQueryObject(documentId: string): DocumentRevisionDocumentQueryObject {
    return { documentId }
  }

  static toDocumentIndexRetentionDTO(revisionId: string): DocumentIndexRetentionDTO {
    return { revisionId }
  }
}
