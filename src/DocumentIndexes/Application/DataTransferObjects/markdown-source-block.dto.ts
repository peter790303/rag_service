export interface MarkdownSourceBlock {
  /** Zero-based position in the ordered source block list. */
  id: number
  /** Inclusive source character offset. */
  startOffset: number
  /** Exclusive source character offset. */
  endOffset: number
  /** Zero-based inclusive source line. */
  startLine: number
  /** Zero-based exclusive source line. */
  endLine: number
  /** Exact source slice, including original indentation and line endings. */
  text: string
  headingPath: string[]
}
