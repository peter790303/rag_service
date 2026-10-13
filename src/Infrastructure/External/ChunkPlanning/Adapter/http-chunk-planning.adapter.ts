import { Inject, Injectable } from '@nestjs/common'

import { RAG_CONFIG, type RagConfig } from '../../../../../config/rag.config.js'
import { ChunkPlanningProvider } from '../../../../Application/KnowledgeBases/Contracts/chunk-planning-provider.js'
import { ChunkPlanningUnavailableException } from '../../../../Domain/Knowledge/Exceptions/chunk-planning-unavailable.exception.js'
import { MarkdownChunkFactory, type MarkdownPlan } from '../../../../Domain/Knowledge/markdown-chunk.factory.js'

const EXTERNAL_REQUEST_TIMEOUT_MS = 30_000

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

@Injectable()
export class HttpChunkPlanningAdapter extends ChunkPlanningProvider {
  constructor(@Inject(RAG_CONFIG) private readonly config: RagConfig) {
    super()
  }

  get modelId(): string {
    return this.config.chunkingModel
  }

  async plan(source: string): Promise<MarkdownPlan> {
    const sourceBlocks = MarkdownChunkFactory.scan(source)

    if (!sourceBlocks.length) return MarkdownChunkFactory.plan(source)

    const blocks = sourceBlocks.map((block) => ({ id: `block-${block.id}`, content: block.text }))
    let response: Response
    try {
      response = await fetch(this.config.chunkingApiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.chunkingApiKey ? { authorization: `Bearer ${this.config.chunkingApiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.modelId,
          messages: [
            {
              role: 'system',
              content:
                'Return only a JSON object with chunkStarts: an ordered array of block IDs. Choose starts that preserve complete semantic units. The first block must start a chunk. Do not rewrite or omit source text.',
            },
            { role: 'user', content: JSON.stringify({ blocks }) },
          ],
        }),
        signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
      })
    } catch {
      throw new ChunkPlanningUnavailableException()
    }

    if (!response.ok) throw new ChunkPlanningUnavailableException()

    let responseBody: unknown
    try {
      responseBody = await response.json()
    } catch {
      throw new ChunkPlanningUnavailableException()
    }

    if (!isRecord(responseBody) || !Array.isArray(responseBody.choices)) throw new ChunkPlanningUnavailableException()

    const firstChoice = responseBody.choices[0]

    if (!isRecord(firstChoice) || !isRecord(firstChoice.message) || typeof firstChoice.message.content !== 'string')
      throw new ChunkPlanningUnavailableException()

    let plannedBoundaries: unknown
    try {
      plannedBoundaries = JSON.parse(firstChoice.message.content)
    } catch {
      throw new ChunkPlanningUnavailableException()
    }

    if (!isRecord(plannedBoundaries) || !Array.isArray(plannedBoundaries.chunkStarts))
      throw new ChunkPlanningUnavailableException()

    const chunkStarts = plannedBoundaries.chunkStarts
    const blockById = new Map(sourceBlocks.map((block) => ['block-' + block.id, block.id]))

    if (!chunkStarts.length || chunkStarts[0] !== blocks[0]?.id) throw new ChunkPlanningUnavailableException()

    const startIds: number[] = []
    for (const start of chunkStarts) {
      const id = typeof start === 'string' ? blockById.get(start) : undefined
      const previousId = startIds.at(-1)

      if (id === undefined || (previousId !== undefined && id <= previousId))
        throw new ChunkPlanningUnavailableException()

      startIds.push(id)
    }

    return MarkdownChunkFactory.plan(source, startIds)
  }
}
