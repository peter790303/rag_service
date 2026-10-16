import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import { GarbageDocumentRevisionAssembler } from '../Assemblers/garbage-document-revision.assembler.ts'
import type { DocumentRevisionRepository } from '../Contracts/document-revision.repository.ts'
import type { PlanDocumentRevisionGarbageUseCaseContract } from '../Contracts/plan-document-revision-garbage.use-case.contract.ts'
import type { PlanDocumentRevisionGarbageDto } from '../DataTransferObjects/document-revision-garbage.dto.ts'

export class PlanDocumentRevisionGarbageUseCase implements PlanDocumentRevisionGarbageUseCaseContract {
  constructor(private readonly documentRevisionRepository: DocumentRevisionRepository) {}

  async execute(planDocumentRevisionGarbageDTO: PlanDocumentRevisionGarbageDto): Promise<DocumentRevision[]> {
    const candidates = await this.documentRevisionRepository.findByCreatedAtLessThanOrEqual(
      GarbageDocumentRevisionAssembler.toDocumentRevisionGarbageCandidatesQueryObject(planDocumentRevisionGarbageDTO),
    )

    return candidates.sort((left, right) => left.id.localeCompare(right.id))
  }
}
