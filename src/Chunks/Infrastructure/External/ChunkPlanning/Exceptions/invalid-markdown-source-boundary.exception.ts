export class InvalidMarkdownSourceBoundaryException extends Error {
  readonly code = 'INVALID_MARKDOWN_SOURCE_BOUNDARY'

  constructor() {
    super('Invalid Markdown block boundary')
    this.name = 'InvalidMarkdownSourceBoundaryException'
  }
}
