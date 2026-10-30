export class MarkdownChunkStartOutOfBoundsException extends Error {
  readonly code = 'MARKDOWN_CHUNK_START_OUT_OF_BOUNDS'

  constructor(readonly context: { blockId: number; blockCount: number }) {
    super('Chunk start is outside scanned blocks')
    this.name = 'MarkdownChunkStartOutOfBoundsException'
  }
}
