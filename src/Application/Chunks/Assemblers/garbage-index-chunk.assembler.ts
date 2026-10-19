import type { IndexChunkGarbageDTO } from '../DataTransferObjects/index-chunk-garbage.dto.ts'
import type { ChunkIndexQueryObject } from '../QueryObjects/chunk.query-object.ts'

export class GarbageIndexChunkAssembler {
  static toChunkIndexQueryObject(indexChunkGarbageDTO: IndexChunkGarbageDTO): ChunkIndexQueryObject {
    return { documentIndexId: indexChunkGarbageDTO.documentIndexId }
  }
}
