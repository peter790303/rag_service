import type { PlanDocumentIndexGarbageQuery } from './plan-document-index-garbage.query.ts'
import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import { DocumentIndexGarbageAssembler } from '../Assemblers/document-index-garbage.assembler.ts'
import type { PlanDocumentIndexGarbageQueryHandlerContract } from '../Contracts/plan-document-index-garbage.query.handler.contract.ts'
import type { DocumentIndexRepository } from '../Ports/Out/Repositories/document-index.repository.ts'

export class PlanDocumentIndexGarbageQueryHandler implements PlanDocumentIndexGarbageQueryHandlerContract {
  constructor(private readonly documentIndexRepository: DocumentIndexRepository) {}

  async execute(planDocumentIndexGarbageDTO: PlanDocumentIndexGarbageQuery): Promise<DocumentIndex[]> {
    return this.documentIndexRepository.findByUnreferencedSinceLessThanOrEqualOrderByIdAsc(
      DocumentIndexGarbageAssembler.toDocumentIndexGarbageCandidatesQueryObject(planDocumentIndexGarbageDTO),
    )
  }
}
