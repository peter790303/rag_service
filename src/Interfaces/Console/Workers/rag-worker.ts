import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'

import { RAG_CONFIG, type RagConfig } from '../../../../config/rag.config.js'
import { CollectRagGarbageUseCase } from '../../../Application/KnowledgeBases/UseCases/collect-rag-garbage.use-case.js'
import { ProcessRagIndexJobUseCase } from '../../../Application/KnowledgeBases/UseCases/process-rag-index-job.use-case.js'

/** Independently hosted background queue and retention process. */
@Injectable()
export class RagWorker implements OnModuleInit, OnModuleDestroy {
  private indexTimer?: NodeJS.Timeout

  private gcTimer?: NodeJS.Timeout

  constructor(
    private readonly collectGarbage: CollectRagGarbageUseCase,
    private readonly processJob: ProcessRagIndexJobUseCase,
    @Inject(RAG_CONFIG) private readonly config: RagConfig,
  ) {}

  onModuleInit(): void {
    this.indexTimer = setInterval(() => void this.processJob.execute(), this.config.workerPollMs)
    this.gcTimer = setInterval(() => void this.collectGarbage.execute(), this.config.gcPollMs)
    this.indexTimer.unref()
    this.gcTimer.unref()
    void this.processJob.execute()
  }

  onModuleDestroy(): void {
    if (this.indexTimer) clearInterval(this.indexTimer)

    if (this.gcTimer) clearInterval(this.gcTimer)
  }
}
