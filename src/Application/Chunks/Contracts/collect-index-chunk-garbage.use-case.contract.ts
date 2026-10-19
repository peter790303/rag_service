import type { IndexChunkGarbageDTO } from '../DataTransferObjects/index-chunk-garbage.dto.ts'

export abstract class CollectIndexChunkGarbageUseCaseContract {
  abstract execute(indexChunkGarbageDTO: IndexChunkGarbageDTO): Promise<void>
}
