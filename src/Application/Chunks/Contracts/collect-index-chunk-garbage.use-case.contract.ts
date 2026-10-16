import type { IndexChunkGarbageDto } from '../DataTransferObjects/index-chunk-garbage.dto.ts'

export abstract class CollectIndexChunkGarbageUseCaseContract {
  abstract execute(indexChunkGarbageDTO: IndexChunkGarbageDto): Promise<void>
}
