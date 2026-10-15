import type { IndexChunkGarbageDto } from '../DataTransferObjects/index-chunk-garbage.dto.ts'
import type { ChunkIndexQueryObject } from '../QueryObjects/chunk.query-object.ts'

export class GarbageIndexChunkAssembler {
  static toChunkIndexQueryObject(indexChunkGarbageDTO: IndexChunkGarbageDto): ChunkIndexQueryObject {
    return { documentIndexId: indexChunkGarbageDTO.documentIndexId }
  }
}
