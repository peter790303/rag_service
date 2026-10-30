import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import type { InspectDocumentIndexRetentionQuery } from '../Queries/inspect-document-index-retention.query.ts'

export abstract class InspectDocumentIndexRetentionQueryHandlerContract {
  abstract execute(documentIndexRetentionQuery: InspectDocumentIndexRetentionQuery): Promise<DocumentIndex | null>
}
