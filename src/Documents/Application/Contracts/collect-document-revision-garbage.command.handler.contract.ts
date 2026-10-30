import type { DocumentRevision } from '../../Domain/Entities/document-revision.ts'
import type { CollectDocumentRevisionGarbageCommand } from '../Commands/collect-document-revision-garbage.command.ts'

export abstract class CollectDocumentRevisionGarbageCommandHandlerContract {
  abstract execute(
    collectDocumentRevisionGarbageDTO: CollectDocumentRevisionGarbageCommand,
  ): Promise<DocumentRevision[]>
}
