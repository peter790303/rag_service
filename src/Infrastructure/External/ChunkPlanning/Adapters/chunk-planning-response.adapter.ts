import { MarkdownChunkStartsAdapter } from './markdown-chunk-starts.adapter.ts'
import { MarkdownDocumentLinksAdapter } from './markdown-document-links.adapter.ts'
import type { MarkdownSourceScan } from './markdown-source.adapter.ts'
import type { MarkdownChunkPlan } from '../../../../Application/Chunks/DataTransferObjects/markdown-chunk-plan.dto.ts'
import type { MarkdownSourceBlock } from '../../../../Application/Chunks/DataTransferObjects/markdown-source-block.dto.ts'
import { ChunkPlanningUnavailableException } from '../../../../Application/Chunks/Exceptions/chunk-planning-unavailable.exception.ts'

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
  } catch (cause) {
    throw new ChunkPlanningUnavailableException({ cause })
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

/** Copies exact source spans and link evidence for validated model block positions. */
export const mapChunkPlanningContent = (
  content: string,
  source: string,
  sourceScan: MarkdownSourceScan,
): MarkdownChunkPlan => {
  const plannedBoundaries = parsePlanningContent(content)
  const externalStarts = readExternalStarts(plannedBoundaries)

  const chunkStarts = mapExternalStarts(externalStarts, sourceScan.blocks)

  return {
    chunks: MarkdownChunkStartsAdapter.toChunks(source, sourceScan.blocks, chunkStarts),
    relations: MarkdownDocumentLinksAdapter.toRelations(sourceScan.relationBlocks),
  }
}

export const mapChunkPlanningResponse = (
  responseBody: unknown,
  source: string,
  sourceScan: MarkdownSourceScan,
): MarkdownChunkPlan => mapChunkPlanningContent(readCompletionContent(responseBody), source, sourceScan)
