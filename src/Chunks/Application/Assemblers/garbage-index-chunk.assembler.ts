import type { CollectIndexChunkGarbageCommand } from '../Commands/collect-index-chunk-garbage.command.ts'
import type { ChunkIndexQO } from '../QueryObjects/chunk.query-object.ts'

export class GarbageIndexChunkAssembler {
  static toChunkIndexQO(command: CollectIndexChunkGarbageCommand): ChunkIndexQO {
    return { documentIndexId: command.documentIndexId }
  }
}
