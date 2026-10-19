import type { StartDocumentPruningRetentionDTO } from '../DataTransferObjects/start-document-pruning-retention.dto.ts'

export abstract class StartDocumentPruningRetentionUseCaseContract {
  abstract execute(startDocumentPruningRetentionDTO: StartDocumentPruningRetentionDTO): Promise<void>
}
