import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { PlanDocumentRevisionGarbageDto } from '../DataTransferObjects/document-revision-garbage.dto.ts'

export abstract class PlanDocumentRevisionGarbageUseCaseContract {
  abstract execute(planDocumentRevisionGarbageDTO: PlanDocumentRevisionGarbageDto): Promise<DocumentRevision[]>
}
