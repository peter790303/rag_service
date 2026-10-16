import type { StartDocumentPruningRetentionDto } from '../DataTransferObjects/start-document-pruning-retention.dto.ts'

export abstract class StartDocumentPruningRetentionUseCaseContract {
  abstract execute(startDocumentPruningRetentionDTO: StartDocumentPruningRetentionDto): Promise<void>
}
