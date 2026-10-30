export interface PlannedMarkdownChunk {
  content: string
  headingPath: string[]
  blockStart: number
  blockEnd: number
  tokenCount: number
}
