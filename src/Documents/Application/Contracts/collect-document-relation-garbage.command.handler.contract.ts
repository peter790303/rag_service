import type { DocumentRelation } from '../../Domain/Entities/document-relation.ts'
import type { CollectDocumentRelationGarbageCommand } from '../Commands/collect-document-relation-garbage.command.ts'

export abstract class CollectDocumentRelationGarbageCommandHandlerContract {
  abstract execute(
    collectDocumentRelationGarbageDTO: CollectDocumentRelationGarbageCommand,
  ): Promise<DocumentRelation[] | null>
}
