import type { StartDocumentPruningRetentionCommand } from '../Commands/start-document-pruning-retention.command.ts'

export abstract class StartDocumentPruningRetentionCommandHandlerContract {
  abstract execute(startDocumentPruningRetentionCommand: StartDocumentPruningRetentionCommand): Promise<void>
}
