import type { StartDocumentIndexPruningRetentionCommand } from '../Commands/start-document-index-pruning-retention.command.ts'

export abstract class StartDocumentIndexPruningRetentionCommandHandlerContract {
  abstract execute(startDocumentIndexPruningRetentionDTO: StartDocumentIndexPruningRetentionCommand): Promise<void>
}
