import type { InspectDocumentIndexRetentionQuery } from '../../../DocumentIndexes/Application/Queries/inspect-document-index-retention.query.ts'
import type { InspectDocumentRelationRetentionQuery } from '../../../DocumentRelations/Application/Queries/inspect-document-relation-retention.query.ts'
import type { InspectDocumentRevisionRetentionQuery } from '../../../DocumentRevisions/Application/Queries/inspect-document-revision-retention.query.ts'
import type { InspectKnowledgeBaseDocumentRetentionQuery } from '../../../KnowledgeBaseDocuments/Application/Queries/inspect-knowledge-base-document-retention.query.ts'
import type { DateTime } from '../../../Shared/Domain/ValueObjects/date-time.ts'
import type { InspectDocumentRetentionQuery } from '../Queries/inspect-document-retention.query.ts'
import type { DocumentIdQO, MarkDocumentUnreferencedQO } from '../QueryObjects/document.query-object.ts'

export class RetentionDocumentAssembler {
  static toDocumentIdQO(documentId: string): DocumentIdQO {
    return { documentId }
  }

  static toInspectDocumentRetentionQuery(documentId: string): InspectDocumentRetentionQuery {
    return { documentId }
  }

  static toInspectDocumentRevisionRetentionQuery(documentId: string): InspectDocumentRevisionRetentionQuery {
    return { documentId }
  }

  static toInspectDocumentRelationRetentionQuery(documentId: string): InspectDocumentRelationRetentionQuery {
    return { documentId }
  }

  static toInspectKnowledgeBaseDocumentRetentionQuery(
    inspectDocumentRetentionQuery: InspectDocumentRetentionQuery,
  ): InspectKnowledgeBaseDocumentRetentionQuery {
    return { documentId: inspectDocumentRetentionQuery.documentId }
  }

  static toInspectDocumentIndexRetentionQuery(
    inspectDocumentRetentionQuery: InspectDocumentRetentionQuery,
  ): InspectDocumentIndexRetentionQuery {
    return { documentId: inspectDocumentRetentionQuery.documentId }
  }

  static toMarkDocumentUnreferencedQO(documentId: string, now: DateTime): MarkDocumentUnreferencedQO {
    return { documentId, unreferencedSince: now.nativeDate }
  }
}
