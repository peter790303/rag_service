import { ChunkDocumentIndexMismatchException } from './Exceptions/chunk-document-index-mismatch.exception.ts'
import { ChunkDocumentIndexRequiredException } from './Exceptions/chunk-document-index-required.exception.ts'
import { ChunkIdentityRequiredException } from './Exceptions/chunk-identity-required.exception.ts'
import { ChunkLexicalSearchMatchMissingException } from './Exceptions/chunk-lexical-search-match-missing.exception.ts'
import { ChunkRetrievalMatchMissingException } from './Exceptions/chunk-retrieval-match-missing.exception.ts'
import { ChunkSourceSpanReversedException } from './Exceptions/chunk-source-span-reversed.exception.ts'
import { ChunkVectorSearchMatchMissingException } from './Exceptions/chunk-vector-search-match-missing.exception.ts'
import { InvalidChunkBlockEndException } from './Exceptions/invalid-chunk-block-end.exception.ts'
import { InvalidChunkBlockStartException } from './Exceptions/invalid-chunk-block-start.exception.ts'
import { InvalidChunkContentException } from './Exceptions/invalid-chunk-content.exception.ts'
import { InvalidChunkCreatedAtException } from './Exceptions/invalid-chunk-created-at.exception.ts'
import { InvalidChunkEmbeddingException } from './Exceptions/invalid-chunk-embedding.exception.ts'
import { InvalidChunkHeadingPathException } from './Exceptions/invalid-chunk-heading-path.exception.ts'
import { InvalidChunkOrdinalException } from './Exceptions/invalid-chunk-ordinal.exception.ts'
import { InvalidChunkSearchVectorException } from './Exceptions/invalid-chunk-search-vector.exception.ts'
import { InvalidChunkTokenCountException } from './Exceptions/invalid-chunk-token-count.exception.ts'
import { ChunkLexicalSearchMatch } from './ValueObjects/chunk-lexical-search-match.ts'
import { ChunkRetrievalMatch } from './ValueObjects/chunk-retrieval-match.ts'
import { ChunkVectorSearchMatch } from './ValueObjects/chunk-vector-search-match.ts'

export type ChunkState = {
  readonly id: string
  readonly documentIndexId: string
  readonly ordinal: number
  readonly headingPath: readonly string[]
  readonly content: string
  readonly blockStart: number
  readonly blockEnd: number
  readonly tokenCount: number | null
  readonly embedding: readonly number[]
  readonly searchVector: string | null
  readonly createdAt: Date
}

/** An identified, immutable source passage belonging to one document index. */
export class Chunk {
  readonly id: string

  readonly documentIndexId: string

  readonly ordinal: number

  readonly content: string

  readonly blockStart: number

  readonly blockEnd: number

  readonly tokenCount: number | null

  private readonly sourceHeadingPath: readonly string[]

  private readonly sourceEmbedding: readonly number[]

  private readonly sourceCreatedAt: Date

  readonly searchVector: string | null

  private vectorSearchMatch: ChunkVectorSearchMatch | null = null

  private lexicalSearchMatch: ChunkLexicalSearchMatch | null = null

  private currentRetrievalMatch: ChunkRetrievalMatch | null = null

  constructor(state: ChunkState) {
    if (typeof state.id !== 'string' || !state.id.trim()) throw new ChunkIdentityRequiredException()

    if (typeof state.documentIndexId !== 'string' || !state.documentIndexId.trim()) {
      throw new ChunkDocumentIndexRequiredException()
    }

    if (!Number.isInteger(state.ordinal) || state.ordinal < 0) throw new InvalidChunkOrdinalException()

    if (
      !Array.isArray(state.headingPath) ||
      !Array.from(state.headingPath).every((heading) => typeof heading === 'string')
    ) {
      throw new InvalidChunkHeadingPathException()
    }

    if (typeof state.content !== 'string') throw new InvalidChunkContentException()

    if (!Number.isInteger(state.blockStart) || state.blockStart < 0) throw new InvalidChunkBlockStartException()

    if (!Number.isInteger(state.blockEnd) || state.blockEnd < 0) throw new InvalidChunkBlockEndException()

    if (state.blockEnd < state.blockStart) throw new ChunkSourceSpanReversedException()

    if (state.tokenCount !== null && (!Number.isInteger(state.tokenCount) || state.tokenCount < 0)) {
      throw new InvalidChunkTokenCountException()
    }

    this.id = state.id
    this.documentIndexId = state.documentIndexId
    this.ordinal = state.ordinal
    this.sourceHeadingPath = [...state.headingPath]
    this.content = state.content
    this.blockStart = state.blockStart
    this.blockEnd = state.blockEnd

    if (!Array.isArray(state.embedding) || !Array.from(state.embedding).every(Number.isFinite)) {
      throw new InvalidChunkEmbeddingException()
    }

    if (state.searchVector !== null && typeof state.searchVector !== 'string') {
      throw new InvalidChunkSearchVectorException()
    }

    if (!(state.createdAt instanceof Date) || !Number.isFinite(state.createdAt.getTime())) {
      throw new InvalidChunkCreatedAtException()
    }

    this.tokenCount = state.tokenCount
    this.sourceEmbedding = [...state.embedding]
    this.searchVector = state.searchVector
    this.sourceCreatedAt = new Date(state.createdAt)
  }

  get embedding(): number[] {
    return [...this.sourceEmbedding]
  }

  get createdAt(): Date {
    return new Date(this.sourceCreatedAt)
  }

  recordVectorSearchMatch(queryVector: readonly number[], cosineDistance: number): void {
    this.vectorSearchMatch = new ChunkVectorSearchMatch(queryVector, cosineDistance)
    this.currentRetrievalMatch = null
  }

  vectorCosineDistanceFor(queryVector: readonly number[]): number | null {
    return this.vectorSearchMatch?.matches(queryVector) ? this.vectorSearchMatch.cosineDistance : null
  }

  requireVectorCosineDistanceFor(queryVector: readonly number[]): number {
    const cosineDistance = this.vectorCosineDistanceFor(queryVector)

    if (cosineDistance === null) throw new ChunkVectorSearchMatchMissingException()

    return cosineDistance
  }

  recordLexicalSearchMatch(terms: readonly string[], score: number): void {
    this.lexicalSearchMatch = new ChunkLexicalSearchMatch(terms, score)
    this.currentRetrievalMatch = null
  }

  requireLexicalSearchScoreFor(terms: readonly string[]): number {
    if (!this.lexicalSearchMatch?.matches(terms)) throw new ChunkLexicalSearchMatchMissingException()

    return this.lexicalSearchMatch.score
  }

  recordRetrievalMatch(
    queryVector: readonly number[],
    terms: readonly string[],
    semanticRank: number | null,
    lexicalRank: number | null,
  ): void {
    this.currentRetrievalMatch = new ChunkRetrievalMatch(
      semanticRank === null ? 0 : 1 - this.requireVectorCosineDistanceFor(queryVector),
      lexicalRank === null ? 0 : this.requireLexicalSearchScoreFor(terms),
      semanticRank,
      lexicalRank,
    )
  }

  get retrievalMatch(): ChunkRetrievalMatch | null {
    return this.currentRetrievalMatch
  }

  requireRetrievalMatch(): ChunkRetrievalMatch {
    if (!this.currentRetrievalMatch) throw new ChunkRetrievalMatchMissingException()

    return this.currentRetrievalMatch
  }

  get headingPath(): string[] {
    return [...this.sourceHeadingPath]
  }

  assertBelongsToDocumentIndex(documentIndexId: string): void {
    if (this.documentIndexId !== documentIndexId) throw new ChunkDocumentIndexMismatchException()
  }
}
