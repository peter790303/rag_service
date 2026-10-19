import type { StartDocumentIndexPruningRetentionDTO } from '../DataTransferObjects/document-index-garbage.dto.ts'

export abstract class StartDocumentIndexPruningRetentionUseCaseContract {
  abstract execute(startDocumentIndexPruningRetentionDTO: StartDocumentIndexPruningRetentionDTO): Promise<void>
}
