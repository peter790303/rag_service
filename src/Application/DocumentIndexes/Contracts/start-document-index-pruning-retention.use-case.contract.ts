import type { StartDocumentIndexPruningRetentionDto } from '../DataTransferObjects/document-index-garbage.dto.ts'

export abstract class StartDocumentIndexPruningRetentionUseCaseContract {
  abstract execute(startDocumentIndexPruningRetentionDTO: StartDocumentIndexPruningRetentionDto): Promise<void>
}
