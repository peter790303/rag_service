import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import type { PlanDocumentIndexGarbageQuery } from '../Queries/plan-document-index-garbage.query.ts'

export abstract class PlanDocumentIndexGarbageQueryHandlerContract {
  abstract execute(planDocumentIndexGarbageDTO: PlanDocumentIndexGarbageQuery): Promise<DocumentIndex[]>
}
