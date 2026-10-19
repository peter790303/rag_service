import { Inject, Injectable } from '@nestjs/common'

import { createChunkPlanningPrompt } from './Adapters/chunk-planning-request.adapter.ts'
import { mapChunkPlanningContent } from './Adapters/chunk-planning-response.adapter.ts'
import { MarkdownSourceAdapter } from './Adapters/markdown-source.adapter.ts'
import { executeHostCliChunkPlanning } from './host-cli-execution.ts'
import { KNOWLEDGE_SERVICE_CONFIG, type KnowledgeServiceConfig } from '../../../../config/knowledge-service.config.ts'
import { ChunkPlanningProvider } from '../../../Application/Chunks/Contracts/chunk-planning-provider.ts'
import type { MarkdownChunkPlan } from '../../../Application/Chunks/DataTransferObjects/markdown-chunk-plan.dto.ts'
import { ChunkPlanningUnavailableException } from '../../../Application/Chunks/Exceptions/chunk-planning-unavailable.exception.ts'

@Injectable()
export class HostCliChunkPlanningClient extends ChunkPlanningProvider {
  constructor(
    @Inject(KNOWLEDGE_SERVICE_CONFIG)
    private readonly chunkPlanningConfig: Pick<
      KnowledgeServiceConfig,
      'chunkingModel' | 'chunkingCliPath' | 'chunkingCliMaxOutputBytes' | 'externalRequestTimeoutMs'
    >,
  ) {
    super()
  }

  get modelId(): string {
    return this.chunkPlanningConfig.chunkingModel
  }

  async plan(source: string, signal?: AbortSignal): Promise<MarkdownChunkPlan> {
    const sourceScan = MarkdownSourceAdapter.scan(source)

    if (!sourceScan.blocks.length) return { chunks: [], relations: [] }

    try {
      const content = await executeHostCliChunkPlanning({
        executable: this.chunkPlanningConfig.chunkingCliPath,
        model: this.modelId,
        prompt: createChunkPlanningPrompt(sourceScan.blocks),
        timeoutMs: this.chunkPlanningConfig.externalRequestTimeoutMs,
        maxOutputBytes: this.chunkPlanningConfig.chunkingCliMaxOutputBytes,
        ...(signal ? { signal } : {}),
      })

      return mapChunkPlanningContent(content, source, sourceScan)
    } catch (cause) {
      if (cause instanceof ChunkPlanningUnavailableException) throw cause

      throw new ChunkPlanningUnavailableException({ cause })
    }
  }
}
