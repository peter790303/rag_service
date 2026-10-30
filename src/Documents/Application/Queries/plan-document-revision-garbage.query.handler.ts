import type { PlanDocumentRevisionGarbageQuery } from './plan-document-revision-garbage.query.ts'
import type { DocumentRevision } from '../../Domain/Entities/document-revision.ts'
import { GarbageDocumentRevisionAssembler } from '../Assemblers/garbage-document-revision.assembler.ts'
import type { PlanDocumentRevisionGarbageQueryHandlerContract } from '../Contracts/plan-document-revision-garbage.query.handler.contract.ts'
import type { DocumentRevisionRepository } from '../Ports/Out/Repositories/document-revision.repository.ts'

export class PlanDocumentRevisionGarbageQueryHandler implements PlanDocumentRevisionGarbageQueryHandlerContract {
  constructor(private readonly documentRevisionRepository: DocumentRevisionRepository) {}

  async execute(planDocumentRevisionGarbageDTO: PlanDocumentRevisionGarbageQuery): Promise<DocumentRevision[]> {
    const candidates = await this.documentRevisionRepository.findByCreatedAtLessThanOrEqual(
      GarbageDocumentRevisionAssembler.toDocumentRevisionGarbageCandidatesQueryObject(planDocumentRevisionGarbageDTO),
    )

    return candidates.sort((left, right) => left.id.localeCompare(right.id))
  }
}
