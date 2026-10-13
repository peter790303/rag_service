import { createHash } from 'node:crypto'

import { MarkdownChunkFactory } from '../markdown-chunk.factory.js'
import { LEXICAL_PROFILE_VERSION } from './lexical-profile.js'

export type RagPipelineHashInput = {
  contentSha256: string
  embeddingModel: string
  embeddingDimensions: number
  chunkingModel: string
  context?: Record<string, unknown> | undefined
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize)

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }

  return value
}

export const calculateRagPipelineHash = (input: RagPipelineHashInput): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        contentSha256: input.contentSha256,
        embeddingModel: input.embeddingModel,
        embeddingDimensions: input.embeddingDimensions,
        embeddingProfile: `mean-pooling-normalized:${input.embeddingDimensions}`,
        chunkingModel: input.chunkingModel,
        chunkingProfile: MarkdownChunkFactory.chunkingProfile,
        lexicalProfile: LEXICAL_PROFILE_VERSION,
        relationProfile: MarkdownChunkFactory.relationProfile,
        context: canonicalize(input.context ?? {}),
      }),
    )
    .digest('hex')
