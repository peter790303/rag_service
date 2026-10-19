import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { PlanDocumentIndexGarbageDTO } from '../DataTransferObjects/document-index-garbage.dto.ts'

export abstract class PlanDocumentIndexGarbageUseCaseContract {
  abstract execute(planDocumentIndexGarbageDTO: PlanDocumentIndexGarbageDTO): Promise<DocumentIndex[]>
}
