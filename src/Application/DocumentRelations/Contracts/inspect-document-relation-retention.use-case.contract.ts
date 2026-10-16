import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import type { InspectDocumentRetentionDto } from '../../Documents/DataTransferObjects/document-retention-scope.dto.ts'

export abstract class InspectDocumentRelationRetentionUseCaseContract {
  abstract execute(inspectDocumentRetentionDTO: InspectDocumentRetentionDto): Promise<DocumentRelation | null>
}
