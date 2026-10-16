import { randomUUID } from 'node:crypto'

import { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import { InvalidDocumentRelationStateException } from '../../../Domain/DocumentRelation/Exceptions/invalid-document-relation-state.exception.ts'
import { WritePlannedDocumentRelationsAssembler } from '../Assemblers/write-planned-document-relations.assembler.ts'
import type { DocumentRelationRepository } from '../Contracts/document-relation.repository.ts'
import type { ReplacePlannedDocumentRelationsUseCaseContract } from '../Contracts/replace-planned-document-relations.use-case.contract.ts'
import type { ReplacePlannedDocumentRelationsInputDto } from '../DataTransferObjects/replace-planned-document-relations-input.dto.ts'
import { InvalidDocumentRelationInputException } from '../Exceptions/invalid-document-relation-input.exception.ts'

/** Replaces an index's relation plan and clears targets resolved from its previous plan. */
export class ReplacePlannedDocumentRelationsUseCase implements ReplacePlannedDocumentRelationsUseCaseContract {
  constructor(private readonly documentRelationRepository: DocumentRelationRepository) {}

  async execute(replacePlannedDocumentRelationsInputDTO: ReplacePlannedDocumentRelationsInputDto): Promise<void> {
    if (
      typeof replacePlannedDocumentRelationsInputDTO?.documentIndexId !== 'string' ||
      !replacePlannedDocumentRelationsInputDTO.documentIndexId.trim()
    )
      throw new InvalidDocumentRelationStateException('sourceIndexId')

    if (!Array.isArray(replacePlannedDocumentRelationsInputDTO.plannedDocumentRelations))
      throw new InvalidDocumentRelationInputException('plannedDocumentRelations')

    const documentRelations = Array.from(replacePlannedDocumentRelationsInputDTO.plannedDocumentRelations).map(
      (relation) => {
        if (!relation) throw new InvalidDocumentRelationInputException('plannedDocumentRelations')

        return new DocumentRelation({
          id: randomUUID(),
          sourceIndexId: replacePlannedDocumentRelationsInputDTO.documentIndexId,
          targetDocumentId: null,
          targetReference: relation.targetReference,
          targetAnchor: relation.targetAnchor,
          relationType: relation.relationType,
          evidenceBlockStart: relation.evidenceBlockStart,
          evidenceBlockEnd: relation.evidenceBlockEnd,
          evidenceText: relation.evidenceText,
        })
      },
    )
    const savePlannedDocumentRelationsQO =
      WritePlannedDocumentRelationsAssembler.toSavePlannedDocumentRelationsQueryObject(documentRelations)

    await this.documentRelationRepository.removeBySourceIndexId({
      sourceIndexId: replacePlannedDocumentRelationsInputDTO.documentIndexId,
    })
    await this.documentRelationRepository.savePlanned(savePlannedDocumentRelationsQO)
  }
}
