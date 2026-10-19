import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import type { InspectDocumentRelationRetentionDTO } from '../DataTransferObjects/inspect-document-relation-retention.dto.ts'

export abstract class InspectDocumentRelationRetentionUseCaseContract {
  abstract execute(
    inspectDocumentRelationRetentionDTO: InspectDocumentRelationRetentionDTO,
  ): Promise<DocumentRelation | null>
}
