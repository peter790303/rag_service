export class MarkdownChunkStartsNotIncreasingException extends Error {
  readonly code = 'MARKDOWN_CHUNK_STARTS_NOT_INCREASING'

  constructor(readonly context: { previousBlockId: number; blockId: number }) {
    super('Chunk starts must be strictly increasing')
    this.name = 'MarkdownChunkStartsNotIncreasingException'
  }
}
