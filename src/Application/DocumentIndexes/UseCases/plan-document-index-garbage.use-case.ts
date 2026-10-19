import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import { DocumentIndexGarbageAssembler } from '../Assemblers/document-index-garbage.assembler.ts'
import type { DocumentIndexRepository } from '../Contracts/document-index.repository.ts'
import type { PlanDocumentIndexGarbageUseCaseContract } from '../Contracts/plan-document-index-garbage.use-case.contract.ts'
import type { PlanDocumentIndexGarbageDTO } from '../DataTransferObjects/document-index-garbage.dto.ts'

export class PlanDocumentIndexGarbageUseCase implements PlanDocumentIndexGarbageUseCaseContract {
  constructor(private readonly documentIndexRepository: DocumentIndexRepository) {}

  async execute(planDocumentIndexGarbageDTO: PlanDocumentIndexGarbageDTO): Promise<DocumentIndex[]> {
    return this.documentIndexRepository.findByUnreferencedSinceLessThanOrEqualOrderByIdAsc(
      DocumentIndexGarbageAssembler.toDocumentIndexGarbageCandidatesQueryObject(planDocumentIndexGarbageDTO),
    )
  }
}
