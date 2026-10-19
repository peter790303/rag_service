import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import { GarbageDocumentRelationAssembler } from '../Assemblers/garbage-document-relation.assembler.ts'
import type { DocumentRelationRepository } from '../Contracts/document-relation.repository.ts'
import type { PlanDocumentRelationGarbageUseCaseContract } from '../Contracts/plan-document-relation-garbage.use-case.contract.ts'
import type { PlanDocumentRelationGarbageDTO } from '../DataTransferObjects/document-relation-garbage.dto.ts'
import { DocumentRelationInputGuard } from '../Guards/document-relation-input.guard.ts'

export class PlanDocumentRelationGarbageUseCase implements PlanDocumentRelationGarbageUseCaseContract {
  constructor(private readonly documentRelationRepository: DocumentRelationRepository) {}

  async execute(planDocumentRelationGarbageDTO: PlanDocumentRelationGarbageDTO): Promise<DocumentRelation[]> {
    DocumentRelationInputGuard.assertObject(planDocumentRelationGarbageDTO)
    DocumentRelationInputGuard.assertIdentifierList(planDocumentRelationGarbageDTO.sourceIndexIds, 'sourceIndexIds')

    const relations = await this.documentRelationRepository.findBySourceIndexIdsOrderByIdAsc(
      GarbageDocumentRelationAssembler.toDocumentRelationSourceIndexesQueryObject(planDocumentRelationGarbageDTO),
    )

    return relations
  }
}
