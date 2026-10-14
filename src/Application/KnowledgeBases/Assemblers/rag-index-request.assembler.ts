export type RagPipelineHashSource = {
  contentSha256: string
  embeddingModel: string
  embeddingDimensions: number
  chunkingModel: string
  context?: Record<string, unknown> | undefined
}

export type RagPipelineHashInput = RagPipelineHashSource & {
  embeddingProfile: string
  chunkingProfile: string
  lexicalProfile: string
  relationProfile: string
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

export const serializeRagPipelineHashInput = (input: RagPipelineHashInput): string => {
  const serialized = JSON.stringify({
    contentSha256: input.contentSha256,
    embeddingModel: input.embeddingModel,
    embeddingDimensions: input.embeddingDimensions,
    embeddingProfile: input.embeddingProfile,
    chunkingModel: input.chunkingModel,
    chunkingProfile: input.chunkingProfile,
    lexicalProfile: input.lexicalProfile,
    relationProfile: input.relationProfile,
    context: canonicalize(input.context ?? {}),
  })

  if (serialized === undefined) throw new TypeError('RAG pipeline hash input could not be serialized')

  return serialized
}

export type RagIndexPipelineSettings = {
  embeddingModel: string
  embeddingDimensions: number
  chunkingModel: string
  chunkingProfile: string
  embeddingProfile: string
  lexicalProfile: string
  relationProfile: string
}

export type RagIndexPipelineIdentity = {
  contentSha256: string
  pipelineHash: string
}

export type RagIndexPipelineMetadata = RagIndexPipelineSettings & RagIndexPipelineIdentity

/** Maps configured pipeline metadata and a computed identity into the persistence shape. */
export class RagIndexRequestAssembler {
  constructor(private readonly settings: RagIndexPipelineSettings) {}

  assemblePipeline(identity: RagIndexPipelineIdentity): RagIndexPipelineMetadata {
    return { ...this.settings, ...identity }
  }

  serializePipelineHashInput(input: RagPipelineHashSource): string {
    return serializeRagPipelineHashInput({
      ...input,
      embeddingProfile: this.settings.embeddingProfile,
      chunkingProfile: this.settings.chunkingProfile,
      lexicalProfile: this.settings.lexicalProfile,
      relationProfile: this.settings.relationProfile,
    })
  }
}
