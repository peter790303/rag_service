import { randomUUID } from 'node:crypto'

import type { ReplacePlannedDocumentRelationsCommand } from './replace-planned-document-relations.command.ts'
import { DocumentRelation } from '../../Domain/Entities/document-relation.ts'
import { WritePlannedDocumentRelationsAssembler } from '../Assemblers/write-planned-document-relations.assembler.ts'
import type { ReplacePlannedDocumentRelationsCommandHandlerContract } from '../Contracts/replace-planned-document-relations.command.handler.contract.ts'
import type { PlannedDocumentRelation } from '../DataTransferObjects/planned-document-relation.dto.ts'
import { InvalidDocumentRelationInputException } from '../Exceptions/invalid-document-relation-input.exception.ts'
import { DocumentRelationInputGuard } from '../Guards/document-relation-input.guard.ts'
import type { DocumentRelationRepository } from '../Ports/Out/Repositories/document-relation.repository.ts'

/** Replaces an index's relation plan and clears targets resolved from its previous plan. */
export class ReplacePlannedDocumentRelationsCommandHandler implements ReplacePlannedDocumentRelationsCommandHandlerContract {
  constructor(private readonly documentRelationRepository: DocumentRelationRepository) {}

  async execute(replacePlannedDocumentRelationsInputDTO: ReplacePlannedDocumentRelationsCommand): Promise<void> {
    DocumentRelationInputGuard.assertObject(replacePlannedDocumentRelationsInputDTO)
    DocumentRelationInputGuard.assertIdentifier(
      replacePlannedDocumentRelationsInputDTO.documentIndexId,
      'documentIndexId',
    )

    if (!Array.isArray(replacePlannedDocumentRelationsInputDTO.plannedDocumentRelations))
      throw new InvalidDocumentRelationInputException('plannedDocumentRelations')

    const documentRelations = Array.from(replacePlannedDocumentRelationsInputDTO.plannedDocumentRelations).map(
      (relation) => {
        DocumentRelationInputGuard.assertObject(relation, 'plannedDocumentRelations')
        const plannedDocumentRelation = relation as unknown as PlannedDocumentRelation

        return new DocumentRelation({
          id: randomUUID(),
          sourceIndexId: replacePlannedDocumentRelationsInputDTO.documentIndexId,
          targetDocumentId: null,
          targetReference: plannedDocumentRelation.targetReference,
          targetAnchor: plannedDocumentRelation.targetAnchor,
          relationType: plannedDocumentRelation.relationType,
          evidenceBlockStart: plannedDocumentRelation.evidenceBlockStart,
          evidenceBlockEnd: plannedDocumentRelation.evidenceBlockEnd,
          evidenceText: plannedDocumentRelation.evidenceText,
        })
      },
    )
    const insertPlannedDocumentRelationsQO =
      WritePlannedDocumentRelationsAssembler.toInsertPlannedDocumentRelationsQueryObject(documentRelations)
    const sourceIndexQO = { sourceIndexId: replacePlannedDocumentRelationsInputDTO.documentIndexId }

    await this.documentRelationRepository.removeBySourceIndexId(sourceIndexQO)
    await this.documentRelationRepository.insertPlanned(insertPlannedDocumentRelationsQO)
  }
}
