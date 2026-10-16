import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import type { PlanDocumentRelationGarbageDto } from '../DataTransferObjects/document-relation-garbage.dto.ts'

export abstract class PlanDocumentRelationGarbageUseCaseContract {
  abstract execute(planDocumentRelationGarbageDTO: PlanDocumentRelationGarbageDto): Promise<DocumentRelation[]>
}
