import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import { GarbageDocumentRelationAssembler } from '../Assemblers/garbage-document-relation.assembler.ts'
import type { CollectDocumentRelationGarbageUseCaseContract } from '../Contracts/collect-document-relation-garbage.use-case.contract.ts'
import type { DocumentRelationRepository } from '../Contracts/document-relation.repository.ts'
import type { CollectDocumentRelationGarbageDTO } from '../DataTransferObjects/document-relation-garbage.dto.ts'
import { DocumentRelationInputGuard } from '../Guards/document-relation-input.guard.ts'

export class CollectDocumentRelationGarbageUseCase implements CollectDocumentRelationGarbageUseCaseContract {
  constructor(private readonly documentRelationRepository: DocumentRelationRepository) {}

  async execute(
    collectDocumentRelationGarbageDTO: CollectDocumentRelationGarbageDTO,
  ): Promise<DocumentRelation[] | null> {
    DocumentRelationInputGuard.assertObject(collectDocumentRelationGarbageDTO)
    DocumentRelationInputGuard.assertIdentifier(collectDocumentRelationGarbageDTO.sourceIndexId, 'sourceIndexId')
    DocumentRelationInputGuard.assertIdentifierList(
      collectDocumentRelationGarbageDTO.lockedDocumentIds,
      'lockedDocumentIds',
    )

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
