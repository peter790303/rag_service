import { KnowledgeEmbeddingUnavailableException } from '../../../../Application/KnowledgeBases/Exceptions/knowledge-embedding-unavailable.exception.ts'

type EmbeddingEntry = { embedding: number[]; index: number | undefined }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const mapEmbeddingEntry = (value: unknown, dimensions: number): EmbeddingEntry => {
  if (!isRecord(value) || !Array.isArray(value.embedding)) throw new KnowledgeEmbeddingUnavailableException()

  const embedding: unknown[] = Array.from(value.embedding)

  if (
    embedding.length !== dimensions ||
    !embedding.every((component): component is number => typeof component === 'number' && Number.isFinite(component)) ||
    !embedding.some((component) => component !== 0)
  ) {
    throw new KnowledgeEmbeddingUnavailableException()
  }

  const index = value.index

  if (index !== undefined && (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0)) {
    throw new KnowledgeEmbeddingUnavailableException()
  }

  return { embedding: [...embedding], index }
}

/** Converts provider vectors to input order without retaining upstream response fields. */
export const mapEmbeddingResponse = (responseBody: unknown, inputCount: number, dimensions: number): number[][] => {
  if (
    !Number.isSafeInteger(inputCount) ||
    inputCount < 0 ||
    !Number.isSafeInteger(dimensions) ||
    dimensions <= 0 ||
    !isRecord(responseBody) ||
    !Array.isArray(responseBody.data) ||
    responseBody.data.length !== inputCount
  ) {
    throw new KnowledgeEmbeddingUnavailableException()
  }

  const responseEntries: unknown[] = Array.from(responseBody.data)
  const entries = responseEntries.map((entry) => mapEmbeddingEntry(entry, dimensions))

  if (entries.every((entry) => entry.index === undefined)) return entries.map((entry) => entry.embedding)

  if (entries.some((entry) => entry.index === undefined)) throw new KnowledgeEmbeddingUnavailableException()

  const orderedEntries = [...entries].sort((left, right) => (left.index ?? -1) - (right.index ?? -1))

  if (!orderedEntries.every((entry, index) => entry.index === index)) throw new KnowledgeEmbeddingUnavailableException()

  return orderedEntries.map((entry) => entry.embedding)
}
