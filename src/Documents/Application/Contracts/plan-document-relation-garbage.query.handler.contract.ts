import type { DocumentRelation } from '../../Domain/Entities/document-relation.ts'
import type { PlanDocumentRelationGarbageQuery } from '../Queries/plan-document-relation-garbage.query.ts'

export abstract class PlanDocumentRelationGarbageQueryHandlerContract {
  abstract execute(planDocumentRelationGarbageDTO: PlanDocumentRelationGarbageQuery): Promise<DocumentRelation[]>
}
