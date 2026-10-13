import { createHash, randomUUID } from 'node:crypto'

import { RequestRagIndexUseCase } from './request-rag-index.use-case.js'
import type { RagConfig } from '../../../../config/rag.config.js'
import { RagJobTargetStateEnum } from '../../../Domain/Knowledge/Enums/rag-job-target-state.enum.js'
import { KnowledgeIndexPendingException } from '../../../Domain/Knowledge/Exceptions/knowledge-index-pending.exception.js'
import { KnowledgeJobNotFoundException } from '../../../Domain/Knowledge/Exceptions/knowledge-job-not-found.exception.js'
import { calculateRagPipelineHash } from '../../../Domain/Knowledge/ValueObjects/rag-pipeline-hash.js'
import { RagFailedJobRetryStore } from '../../../Infrastructure/Persistence/Repositories/Contracts/rag-job-management.js'
import type { RetryContext } from '../../../Infrastructure/Persistence/Repositories/Contracts/rag-job-management.js'
import { EmbeddingProvider } from '../Contracts/embedding-provider.js'
import type { RetryFailedJobDto } from '../DataTransferObjects/rag.dto.js'

export class RetryFailedRagJobUseCase {
  constructor(
    private readonly failedJobs: RagFailedJobRetryStore,
    private readonly embeddings: EmbeddingProvider,
    private readonly config: RagConfig,
    private readonly requestIndex: RequestRagIndexUseCase,
  ) {}

  async execute(projectId: string, failedJobId: string): Promise<RetryFailedJobDto> {
    const retryContext = await this.failedJobs.readRetryContext(projectId, failedJobId)

    if (!retryContext) throw new KnowledgeJobNotFoundException(failedJobId)

    const { failedJob, knowledgeBase, document, membership, documentIndex, activeJob, currentSource } = retryContext

    if (knowledgeBase.projectId !== projectId) throw new KnowledgeJobNotFoundException(failedJobId)

    if (failedJob.retriedAt) throw new KnowledgeIndexPendingException('Failed job has already been retried')

    if (!membership || activeJob)
      throw new KnowledgeIndexPendingException('Failed job is no longer the current retry target')

    if (!document.latestRevision || !currentSource)
      throw new KnowledgeIndexPendingException('The current document source is unavailable for reindexing')

    const contentSha256 = createHash('sha256').update(document.latestRevision.content).digest('hex')
    const expectedPipelineHash = calculateRagPipelineHash({
      contentSha256,
      embeddingModel: this.embeddings.modelId,
      embeddingDimensions: this.config.embeddingDimensions,
      chunkingModel: this.config.chunkingModel,
      context: currentSource.payload,
    })

    const sourceIsStale =
      membership.requestedGeneration !== failedJob.generation ||
      !documentIndex ||
      documentIndex.id !== failedJob.documentIndexId ||
      documentIndex.documentRevisionId !== document.latestRevision.id ||
      documentIndex.pipelineHash !== expectedPipelineHash

    if (sourceIsStale) return this.requestCurrentSource(failedJob.id, currentSource)

    const now = new Date()
    const retryResult = await this.failedJobs.retryFailedJobAtomically({
      projectId,
      failedJobId: failedJob.id,
      expectedKnowledgeBaseId: failedJob.knowledgeBaseId,
      expectedDocumentId: failedJob.documentId,
      expectedDocumentIndexId: failedJob.documentIndexId,
      expectedGeneration: failedJob.generation,
      expectedRevisionId: document.latestRevision.id,
      expectedPipelineHash,
      now,
      idempotencyKey: randomUUID(),
    })

    if (retryResult.status === 'stale') {
      const currentContext = await this.failedJobs.readRetryContext(projectId, failedJob.id)

      if (!currentContext?.currentSource)
        throw new KnowledgeIndexPendingException('Current source changed during retry')

      return this.requestCurrentSource(failedJob.id, currentContext.currentSource)
    }

    if (retryResult.status !== 'retried') {
      if (retryResult.status === 'not-found') throw new KnowledgeJobNotFoundException(failedJob.id)

      throw new KnowledgeIndexPendingException(`Failed job is no longer retryable: ${retryResult.status}`)
    }

    return {
      jobId: retryResult.jobId,
      failedJobId: failedJob.id,
      status: RagJobTargetStateEnum.QUEUED,
      retryOfFailedJobId: failedJob.id,
    }
  }

  private async requestCurrentSource(
    failedJobId: string,
    source: NonNullable<RetryContext['currentSource']>,
  ): Promise<RetryFailedJobDto> {
    const result = await this.requestIndex.execute(source)

    if (result.blockedByFailedJob) {
      throw new KnowledgeIndexPendingException('The current source is blocked by a failed indexing job')
    }

    return {
      jobId: result.jobId,
      failedJobId,
      status: result.jobId ? RagJobTargetStateEnum.QUEUED : RagJobTargetStateEnum.READY,
      retryOfFailedJobId: failedJobId,
    }
  }
}
