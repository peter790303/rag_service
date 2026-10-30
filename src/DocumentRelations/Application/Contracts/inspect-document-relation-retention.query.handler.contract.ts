import type { DocumentRelation } from '../../Domain/Entities/document-relation.ts'
import type { InspectDocumentRelationRetentionQuery } from '../Queries/inspect-document-relation-retention.query.ts'

export abstract class InspectDocumentRelationRetentionQueryHandlerContract {
  abstract execute(
    inspectDocumentRelationRetentionQuery: InspectDocumentRelationRetentionQuery,
  ): Promise<DocumentRelation | null>
}
