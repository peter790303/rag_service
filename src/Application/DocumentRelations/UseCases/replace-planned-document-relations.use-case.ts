import { randomUUID } from 'node:crypto'

import { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import { WritePlannedDocumentRelationsAssembler } from '../Assemblers/write-planned-document-relations.assembler.ts'
import type { DocumentRelationRepository } from '../Contracts/document-relation.repository.ts'
import type { ReplacePlannedDocumentRelationsUseCaseContract } from '../Contracts/replace-planned-document-relations.use-case.contract.ts'
import type { PlannedDocumentRelation } from '../DataTransferObjects/planned-document-relation.dto.ts'
import type { ReplacePlannedDocumentRelationsInputDTO } from '../DataTransferObjects/replace-planned-document-relations-input.dto.ts'
import { InvalidDocumentRelationInputException } from '../Exceptions/invalid-document-relation-input.exception.ts'
import { DocumentRelationInputGuard } from '../Guards/document-relation-input.guard.ts'

/** Replaces an index's relation plan and clears targets resolved from its previous plan. */
export class ReplacePlannedDocumentRelationsUseCase implements ReplacePlannedDocumentRelationsUseCaseContract {
  constructor(private readonly documentRelationRepository: DocumentRelationRepository) {}

  async execute(replacePlannedDocumentRelationsInputDTO: ReplacePlannedDocumentRelationsInputDTO): Promise<void> {
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
