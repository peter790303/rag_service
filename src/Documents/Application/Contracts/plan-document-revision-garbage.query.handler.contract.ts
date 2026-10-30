import type { DocumentRevision } from '../../Domain/Entities/document-revision.ts'
import type { PlanDocumentRevisionGarbageQuery } from '../Queries/plan-document-revision-garbage.query.ts'

export abstract class PlanDocumentRevisionGarbageQueryHandlerContract {
  abstract execute(planDocumentRevisionGarbageDTO: PlanDocumentRevisionGarbageQuery): Promise<DocumentRevision[]>
}
