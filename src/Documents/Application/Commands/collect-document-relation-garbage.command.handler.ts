import type { CollectDocumentRelationGarbageCommand } from './collect-document-relation-garbage.command.ts'
import type { DocumentRelation } from '../../Domain/Entities/document-relation.ts'
import { GarbageDocumentRelationAssembler } from '../Assemblers/garbage-document-relation.assembler.ts'
import type { CollectDocumentRelationGarbageCommandHandlerContract } from '../Contracts/collect-document-relation-garbage.command.handler.contract.ts'
import { DocumentRelationInputGuard } from '../Guards/document-relation-input.guard.ts'
import type { DocumentRelationRepository } from '../Ports/Out/Repositories/document-relation.repository.ts'

export class CollectDocumentRelationGarbageCommandHandler implements CollectDocumentRelationGarbageCommandHandlerContract {
  constructor(private readonly documentRelationRepository: DocumentRelationRepository) {}

  async execute(
    collectDocumentRelationGarbageDTO: CollectDocumentRelationGarbageCommand,
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
