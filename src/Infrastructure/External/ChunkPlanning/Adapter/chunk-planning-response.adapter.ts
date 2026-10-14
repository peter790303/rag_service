import { ChunkPlanningUnavailableException } from '../../../../Domain/Knowledge/Exceptions/chunk-planning-unavailable.exception.js'
import type { MarkdownSourceBlock } from '../../../../Domain/Knowledge/markdown-chunk.factory.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readCompletionContent = (responseBody: unknown): string => {
  if (!isRecord(responseBody) || !Array.isArray(responseBody.choices)) throw new ChunkPlanningUnavailableException()

  const firstChoice = responseBody.choices[0]

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message) || typeof firstChoice.message.content !== 'string')
    throw new ChunkPlanningUnavailableException()

  return firstChoice.message.content
}

const parsePlanningContent = (content: string): unknown => {
  try {
    return JSON.parse(content)
  } catch {
    throw new ChunkPlanningUnavailableException()
  }
}

const readExternalStarts = (content: unknown): unknown[] => {
  if (!isRecord(content) || !Array.isArray(content.chunkStarts)) throw new ChunkPlanningUnavailableException()

  return content.chunkStarts
}

const mapExternalStarts = (starts: unknown[], sourceBlocks: readonly MarkdownSourceBlock[]): number[] => {
  const localIdByExternalId = new Map(sourceBlocks.map((block) => [`block-${block.id}`, block.id]))
  const firstBlock = sourceBlocks[0]

  if (!firstBlock || !starts.length || starts[0] !== `block-${firstBlock.id}`)
    throw new ChunkPlanningUnavailableException()

  const localStarts = starts.map((start): number => {
    const localId = typeof start === 'string' ? localIdByExternalId.get(start) : undefined

    if (localId === undefined) throw new ChunkPlanningUnavailableException()

    return localId
  })

  if (
    !localStarts.every((localId, index) => {
      if (index === 0) return true

      const previousId = localStarts[index - 1]

      return previousId !== undefined && localId > previousId
    })
  )
    throw new ChunkPlanningUnavailableException()

  return localStarts
}

/** Maps the model completion response into validated local Markdown block IDs. */
export const mapChunkPlanningResponse = (
  responseBody: unknown,
  sourceBlocks: readonly MarkdownSourceBlock[],
): number[] => {
  const content = readCompletionContent(responseBody)
  const plannedBoundaries = parsePlanningContent(content)
  const externalStarts = readExternalStarts(plannedBoundaries)

  return mapExternalStarts(externalStarts, sourceBlocks)
}
