import type { CollectDocumentIndexFailureGarbageCommand } from '../Commands/collect-document-index-failure-garbage.command.ts'
import type { ExpiredDocumentIndexFailureDTO } from '../DataTransferObjects/expired-document-index-failure.dto.ts'

export abstract class CollectDocumentIndexFailureGarbageCommandHandlerContract {
  abstract execute(command: CollectDocumentIndexFailureGarbageCommand): Promise<ExpiredDocumentIndexFailureDTO[]>
}
