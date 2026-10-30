import type { DocumentIndexExecutionRetentionDTO } from '../DTOs/document-index-execution-retention.dto.ts'
import type { InspectDocumentIndexExecutionRetentionQuery } from '../Queries/inspect-document-index-execution-retention.query.ts'

export abstract class InspectDocumentIndexExecutionRetentionQueryHandlerContract {
  abstract execute(query: InspectDocumentIndexExecutionRetentionQuery): Promise<DocumentIndexExecutionRetentionDTO>
}
