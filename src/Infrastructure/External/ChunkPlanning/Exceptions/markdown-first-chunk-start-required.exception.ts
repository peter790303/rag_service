export class MarkdownFirstChunkStartRequiredException extends Error {
  readonly code = 'MARKDOWN_FIRST_CHUNK_START_REQUIRED'

  constructor() {
    super('Chunk starts must include the first block')
    this.name = 'MarkdownFirstChunkStartRequiredException'
  }
}
