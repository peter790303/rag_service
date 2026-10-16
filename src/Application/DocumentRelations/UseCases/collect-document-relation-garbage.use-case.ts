import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import { InvalidDocumentRelationStateException } from '../../../Domain/DocumentRelation/Exceptions/invalid-document-relation-state.exception.ts'
import { GarbageDocumentRelationAssembler } from '../Assemblers/garbage-document-relation.assembler.ts'
import type { CollectDocumentRelationGarbageUseCaseContract } from '../Contracts/collect-document-relation-garbage.use-case.contract.ts'
import type { DocumentRelationRepository } from '../Contracts/document-relation.repository.ts'
import type { CollectDocumentRelationGarbageDto } from '../DataTransferObjects/document-relation-garbage.dto.ts'
import { InvalidDocumentRelationInputException } from '../Exceptions/invalid-document-relation-input.exception.ts'

export class CollectDocumentRelationGarbageUseCase implements CollectDocumentRelationGarbageUseCaseContract {
  constructor(private readonly documentRelationRepository: DocumentRelationRepository) {}

  async execute(
    collectDocumentRelationGarbageDTO: CollectDocumentRelationGarbageDto,
  ): Promise<DocumentRelation[] | null> {
    if (
      typeof collectDocumentRelationGarbageDTO?.sourceIndexId !== 'string' ||
      !collectDocumentRelationGarbageDTO.sourceIndexId.trim()
    )
      throw new InvalidDocumentRelationStateException('sourceIndexId')

    if (!Array.isArray(collectDocumentRelationGarbageDTO.lockedDocumentIds))
      throw new InvalidDocumentRelationInputException('lockedDocumentIds')

    const relations = await this.documentRelationRepository.findBySourceIndexIdsOrderByIdAsc(
      GarbageDocumentRelationAssembler.toCollectionDocumentRelationSourceIndexesQueryObject(
        collectDocumentRelationGarbageDTO,
      ),
    )
    const targetDocumentIds = GarbageDocumentRelationAssembler.toTargetDocumentIds(relations)

    // New parents require the next collection's complete parent-lock set.
    if (
      targetDocumentIds.some((documentId) => !collectDocumentRelationGarbageDTO.lockedDocumentIds.includes(documentId))
    )
      return null

    await this.documentRelationRepository.removeBySourceIndexId(
      GarbageDocumentRelationAssembler.toDocumentRelationSourceIndexQueryObject(collectDocumentRelationGarbageDTO),
    )

    return relations
  }
}
