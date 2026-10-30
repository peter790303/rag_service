import type { ReplaceIndexChunkCommand } from '../Commands/replace-index-chunk.command.ts'

/** Replaces validated chunks and relations for the current claimed index. */
export abstract class ReplaceIndexChunkCommandHandlerContract {
  abstract execute(replaceIndexChunkCommand: ReplaceIndexChunkCommand): Promise<void>
}
