import type { CollectIndexChunkGarbageCommand } from '../Commands/collect-index-chunk-garbage.command.ts'

export abstract class CollectIndexChunkGarbageCommandHandlerContract {
  abstract execute(indexChunkGarbageCommand: CollectIndexChunkGarbageCommand): Promise<void>
}
