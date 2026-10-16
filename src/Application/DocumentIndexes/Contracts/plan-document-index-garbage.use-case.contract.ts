import type {
  DocumentIndexGarbagePlanDto,
  PlanDocumentIndexGarbageDto,
} from '../DataTransferObjects/document-index-garbage.dto.ts'

export abstract class PlanDocumentIndexGarbageUseCaseContract {
  abstract execute(planDocumentIndexGarbageDTO: PlanDocumentIndexGarbageDto): Promise<DocumentIndexGarbagePlanDto>
}
