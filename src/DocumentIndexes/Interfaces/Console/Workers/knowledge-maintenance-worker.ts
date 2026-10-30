import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'

import {
  KNOWLEDGE_SERVICE_CONFIG,
  type KnowledgeServiceConfig,
} from '../../../../../config/knowledge-service.config.ts'
import { DocumentGarbageCollectionRequestedEvent } from '../../../../Documents/Application/Events/document-garbage-collection-requested.event.ts'
import { DocumentGarbageCollectionRequestedListener } from '../../../../Documents/Application/Listeners/document-garbage-collection-requested.listener.ts'
import { DocumentIndexingDispatchedEvent } from '../../../Application/Events/document-indexing-dispatched.event.ts'
import { DispatchDocumentIndexingListener } from '../../../Application/Listeners/dispatch-document-indexing.listener.ts'
import { ProcessDocumentIndexListener } from '../../../Application/Listeners/process-document-index.listener.ts'

/** Independently hosted background queue and retention process. */
@Injectable()
export class KnowledgeMaintenanceWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('IndexWorker')

  private indexTimer?: NodeJS.Timeout

  private gcTimer?: NodeJS.Timeout

  private deliveringJob = false

  constructor(
    @Inject(DocumentGarbageCollectionRequestedListener)
    private readonly collectGarbage: Pick<DocumentGarbageCollectionRequestedListener, 'handle'>,
    @Inject(DispatchDocumentIndexingListener)
    private readonly dispatchDocumentIndexing: Pick<DispatchDocumentIndexingListener, 'handle'>,
    @Inject(ProcessDocumentIndexListener)
    private readonly processDocumentIndex: Pick<ProcessDocumentIndexListener, 'handle'>,
    @Inject(KNOWLEDGE_SERVICE_CONFIG)
    private readonly serviceConfig: Pick<KnowledgeServiceConfig, 'workerPollMs' | 'gcPollMs'>,
  ) {}

  onModuleInit(): void {
    this.indexTimer = setInterval(
      () => this.runSafely('index job', () => this.deliverNextJob()),
      this.serviceConfig.workerPollMs,
    )
    this.gcTimer = setInterval(
      () => this.runSafely('garbage collection', () => this.deliverGarbageCollection()),
      this.serviceConfig.gcPollMs,
    )
    this.indexTimer.unref()
    this.gcTimer.unref()
    this.runSafely('index job', () => this.deliverNextJob())
  }

  async deliverNextJob(): Promise<void> {
    if (this.deliveringJob) return

    this.deliveringJob = true
    try {
      const claim = await this.dispatchDocumentIndexing.handle()

      if (!claim) return

      await this.processDocumentIndex.handle(new DocumentIndexingDispatchedEvent(claim))
    } finally {
      this.deliveringJob = false
    }
  }

  async deliverGarbageCollection(): Promise<void> {
    await this.collectGarbage.handle(new DocumentGarbageCollectionRequestedEvent())
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
