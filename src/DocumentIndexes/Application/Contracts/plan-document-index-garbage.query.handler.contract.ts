import type { DocumentIndexGarbagePlanDTO } from '../DTOs/document-index-garbage.dto.ts'
import type { PlanDocumentIndexGarbageQuery } from '../Queries/plan-document-index-garbage.query.ts'

export abstract class PlanDocumentIndexGarbageQueryHandlerContract {
  abstract execute(planDocumentIndexGarbageQuery: PlanDocumentIndexGarbageQuery): Promise<DocumentIndexGarbagePlanDTO>
}
