import type { DocumentRelation } from '../../Domain/Entities/document-relation.ts'
import type { CollectDocumentRelationGarbageCommand } from '../Commands/collect-document-relation-garbage.command.ts'

export abstract class CollectDocumentRelationGarbageCommandHandlerContract {
  abstract execute(
    collectDocumentRelationGarbageCommand: CollectDocumentRelationGarbageCommand,
  ): Promise<DocumentRelation[] | null>
}
