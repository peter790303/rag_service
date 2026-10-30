import type { PlanDocumentIndexGarbageQuery } from './plan-document-index-garbage.query.ts'
import { DocumentIndexGarbageAssembler } from '../Assemblers/document-index-garbage.assembler.ts'
import type { PlanDocumentIndexGarbageQueryHandlerContract } from '../Contracts/plan-document-index-garbage.query.handler.contract.ts'
import type { DocumentIndexGarbagePlanDTO } from '../DataTransferObjects/document-index-garbage.dto.ts'
import type { DocumentIndexFailureArchive } from '../Ports/Out/Gateways/document-index-failure.archive.ts'
import type { DocumentIndexRepository } from '../Ports/Out/Repositories/document-index.repository.ts'

export class PlanDocumentIndexGarbageQueryHandler implements PlanDocumentIndexGarbageQueryHandlerContract {
  constructor(
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly failureArchive: DocumentIndexFailureArchive,
  ) {}

  async execute(planDocumentIndexGarbageQuery: PlanDocumentIndexGarbageQuery): Promise<DocumentIndexGarbagePlanDTO> {
    const failures = await this.failureArchive.findExpiredFailures({
      cutoff: planDocumentIndexGarbageQuery.retentionCutoff,
    })
    const indexes = await this.documentIndexRepository.findByUnreferencedSinceLessThanOrEqualOrderByIdAsc(
      DocumentIndexGarbageAssembler.toDocumentIndexGarbageCandidatesQO(planDocumentIndexGarbageQuery),
    )

    return { failures, indexes }
  }
}
