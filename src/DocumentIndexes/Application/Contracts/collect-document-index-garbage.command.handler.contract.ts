import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import type { CollectDocumentIndexGarbageCommand } from '../Commands/collect-document-index-garbage.command.ts'

export abstract class CollectDocumentIndexGarbageCommandHandlerContract {
  abstract execute(collectDocumentIndexGarbageCommand: CollectDocumentIndexGarbageCommand): Promise<DocumentIndex[]>
}
