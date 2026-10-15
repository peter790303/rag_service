import type { ReplaceIndexChunkInputDto } from '../DataTransferObjects/replace-index-chunk-input.dto.ts'

/** Replaces validated chunks and relations for the current claimed index. */
export abstract class ReplaceIndexChunkUseCaseContract {
  abstract execute(replaceIndexChunkInputDTO: ReplaceIndexChunkInputDto): Promise<void>
}
