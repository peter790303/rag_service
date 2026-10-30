import type { DocumentRevision } from '../../Domain/Entities/document-revision.ts'
import type { InspectDocumentRevisionRetentionQuery } from '../Queries/inspect-document-revision-retention.query.ts'

export abstract class InspectDocumentRevisionRetentionQueryHandlerContract {
  abstract execute(
    inspectDocumentRevisionRetentionQuery: InspectDocumentRevisionRetentionQuery,
  ): Promise<DocumentRevision | null>
}
