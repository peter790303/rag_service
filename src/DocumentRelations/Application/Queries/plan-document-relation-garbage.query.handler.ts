import type { PlanDocumentRelationGarbageQuery } from './plan-document-relation-garbage.query.ts'
import type { DocumentRelation } from '../../Domain/Entities/document-relation.ts'
import { GarbageDocumentRelationAssembler } from '../Assemblers/garbage-document-relation.assembler.ts'
import type { PlanDocumentRelationGarbageQueryHandlerContract } from '../Contracts/plan-document-relation-garbage.query.handler.contract.ts'
import { DocumentRelationInputGuard } from '../Guards/document-relation-input.guard.ts'
import type { DocumentRelationRepository } from '../Ports/Out/Repositories/document-relation.repository.ts'

export class PlanDocumentRelationGarbageQueryHandler implements PlanDocumentRelationGarbageQueryHandlerContract {
  constructor(private readonly documentRelationRepository: DocumentRelationRepository) {}

  async execute(planDocumentRelationGarbageQuery: PlanDocumentRelationGarbageQuery): Promise<DocumentRelation[]> {
    DocumentRelationInputGuard.assertObject(planDocumentRelationGarbageQuery)
    DocumentRelationInputGuard.assertIdentifierList(planDocumentRelationGarbageQuery.sourceIndexIds, 'sourceIndexIds')

    const relations = await this.documentRelationRepository.findBySourceIndexIdsOrderByIdAsc(
      GarbageDocumentRelationAssembler.toDocumentRelationSourceIndexesQO(planDocumentRelationGarbageQuery),
    )

    return relations
  }
}
