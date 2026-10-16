import { DocumentIndexGarbageAssembler } from '../Assemblers/document-index-garbage.assembler.ts'
import type { DocumentIndexFailureArchive } from '../Contracts/document-index-failure.archive.ts'
import type { DocumentIndexRepository } from '../Contracts/document-index.repository.ts'
import type { PlanDocumentIndexGarbageUseCaseContract } from '../Contracts/plan-document-index-garbage.use-case.contract.ts'
import type {
  DocumentIndexGarbagePlanDto,
  PlanDocumentIndexGarbageDto,
} from '../DataTransferObjects/document-index-garbage.dto.ts'

export class PlanDocumentIndexGarbageUseCase implements PlanDocumentIndexGarbageUseCaseContract {
  constructor(
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly documentIndexFailureArchive: DocumentIndexFailureArchive,
  ) {}

  async execute(planDocumentIndexGarbageDTO: PlanDocumentIndexGarbageDto): Promise<DocumentIndexGarbagePlanDto> {
    const failedJobs = await this.documentIndexFailureArchive.findExpiredFailures(
      DocumentIndexGarbageAssembler.toDocumentIndexGarbageCandidatesQueryObject(planDocumentIndexGarbageDTO),
    )
    const indexes = await this.documentIndexRepository.findByUnreferencedSinceLessThanOrEqualOrderByIdAsc(
      DocumentIndexGarbageAssembler.toDocumentIndexGarbageCandidatesQueryObject(planDocumentIndexGarbageDTO),
    )

    return DocumentIndexGarbageAssembler.toDocumentIndexGarbagePlanDTO(failedJobs, indexes)
  }
}
