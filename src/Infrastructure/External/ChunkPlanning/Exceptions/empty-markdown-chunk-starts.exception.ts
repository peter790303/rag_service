export class EmptyMarkdownChunkStartsException extends Error {
  readonly code = 'EMPTY_MARKDOWN_CHUNK_STARTS'

  constructor() {
    super('Empty Markdown cannot have chunk starts')
    this.name = 'EmptyMarkdownChunkStartsException'
  }
}
