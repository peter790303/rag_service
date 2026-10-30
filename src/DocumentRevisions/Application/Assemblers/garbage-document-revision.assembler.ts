import type { InspectDocumentIndexRetentionQuery } from '../../../DocumentIndexes/Application/Queries/inspect-document-index-retention.query.ts'
import type { PlanDocumentRevisionGarbageQuery } from '../Queries/plan-document-revision-garbage.query.ts'
import type {
  DocumentRevisionIdQO,
  DocumentRevisionDocumentQO,
  DocumentRevisionGarbageCandidatesQO,
} from '../QueryObjects/document-revision.query-object.ts'

export class GarbageDocumentRevisionAssembler {
  static toDocumentRevisionGarbageCandidatesQO(
    planDocumentRevisionGarbageQuery: PlanDocumentRevisionGarbageQuery,
  ): DocumentRevisionGarbageCandidatesQO {
    return { cutoff: planDocumentRevisionGarbageQuery.retentionCutoff }
  }

  static toDocumentRevisionIdQO(revisionId: string): DocumentRevisionIdQO {
    return { revisionId }
  }

  static toDocumentRevisionDocumentQO(documentId: string): DocumentRevisionDocumentQO {
    return { documentId }
  }

  static toInspectDocumentIndexRetentionQuery(revisionId: string): InspectDocumentIndexRetentionQuery {
    return { revisionId }
  }
}
