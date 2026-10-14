import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'

import { RAG_CONFIG, type RagConfig } from '../../../../config/rag.config.js'
import { CollectRagGarbageUseCase } from '../../../Application/KnowledgeBases/UseCases/collect-rag-garbage.use-case.js'
import { ProcessRagIndexJobUseCase } from '../../../Application/KnowledgeBases/UseCases/process-rag-index-job.use-case.js'

/** Independently hosted background queue and retention process. */
@Injectable()
export class RagWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RagWorker.name)

  private indexTimer?: NodeJS.Timeout

  private gcTimer?: NodeJS.Timeout

  constructor(
    @Inject(CollectRagGarbageUseCase)
    private readonly collectGarbage: Pick<CollectRagGarbageUseCase, 'execute'>,
    @Inject(ProcessRagIndexJobUseCase)
    private readonly processJob: Pick<ProcessRagIndexJobUseCase, 'execute'>,
    @Inject(RAG_CONFIG)
    private readonly config: Pick<RagConfig, 'workerPollMs' | 'gcPollMs'>,
  ) {}

  onModuleInit(): void {
    this.indexTimer = setInterval(
      () => this.runSafely('index job', () => this.processJob.execute()),
      this.config.workerPollMs,
    )
    this.gcTimer = setInterval(
      () => this.runSafely('garbage collection', () => this.collectGarbage.execute()),
      this.config.gcPollMs,
    )
    this.indexTimer.unref()
    this.gcTimer.unref()
    this.runSafely('index job', () => this.processJob.execute())
  }

  onModuleDestroy(): void {
    if (this.indexTimer) clearInterval(this.indexTimer)

    if (this.gcTimer) clearInterval(this.gcTimer)
  }

  private runSafely(taskName: string, task: () => Promise<unknown>): void {
    void Promise.resolve()
      .then(task)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        const stack = error instanceof Error ? error.stack : undefined
        this.logger.error(`RAG ${taskName} task failed: ${message}`, stack)
      })
  }
}
