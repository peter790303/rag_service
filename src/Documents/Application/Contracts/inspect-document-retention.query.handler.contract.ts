import type { Document } from '../../Domain/Entities/document.ts'
import type { InspectDocumentRetentionQuery } from '../Queries/inspect-document-retention.query.ts'

export abstract class InspectDocumentRetentionQueryHandlerContract {
  abstract execute(inspectDocumentRetentionQuery: InspectDocumentRetentionQuery): Promise<Document | null>
}
