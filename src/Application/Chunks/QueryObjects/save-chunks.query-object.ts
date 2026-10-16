export type SaveChunksQueryObject = {
  readonly chunks: readonly {
    readonly id: string
    readonly documentIndexId: string
    readonly ordinal: number
    readonly headingPath: string[]
    readonly content: string
    readonly blockStart: number
    readonly blockEnd: number
    readonly tokenCount: number | null
    readonly embedding: number[]
    readonly createdAt: Date
  }[]
}
