import type { ClaimNextRagJobUseCase } from './claim-next-rag-job.use-case.js'
import type { CompleteRagIndexJobUseCase } from './complete-rag-index-job.use-case.js'
import type { FailRagIndexJobUseCase } from './fail-rag-index-job.use-case.js'
import type { ReplaceIndexChunkUseCase } from './replace-index-chunk.use-case.js'
import { RagExecutionStageEnum } from '../../../Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { ChunkPlanningUnavailableException } from '../../../Domain/Knowledge/Exceptions/chunk-planning-unavailable.exception.js'
import { InvalidRagJobLeaseException } from '../../../Domain/Knowledge/Exceptions/invalid-rag-job-lease.exception.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'
import { RagJob, RAG_JOB_STATUS } from '../../../Domain/Knowledge/rag-job.js'
import { ChunkPlanningProvider } from '../Contracts/chunk-planning-provider.js'
import { EmbeddingProvider } from '../Contracts/embedding-provider.js'
import type { RagIndexProcessingRepository } from '../Contracts/rag-indexing-repository.js'
import type { RagLexicalSearchFormatter } from '../Contracts/rag-lexical-search-formatter.js'
import type { ClaimedRagIndexJob, RagJobProgress } from '../DataTransferObjects/rag-index-job.dto.js'

const genericFailureMessage = 'RAG indexing failed'

/** Orchestrates queue claim, content planning, embedding, persistence, and retry outcome. */
export class ProcessRagIndexJobUseCase {
  private busy = false

  constructor(
    private readonly workflow: RagIndexProcessingRepository,
    private readonly replaceIndexPlan: Pick<ReplaceIndexChunkUseCase, 'execute'>,
    private readonly completeIndexJob: Pick<CompleteRagIndexJobUseCase, 'execute'>,
    private readonly claimNextJob: Pick<ClaimNextRagJobUseCase, 'execute'>,
    private readonly failIndexJob: Pick<FailRagIndexJobUseCase, 'execute'>,
    private readonly embeddings: EmbeddingProvider,
    private readonly chunkPlanner: ChunkPlanningProvider,
    private readonly lexicalFormatter: RagLexicalSearchFormatter,
    private readonly workerLeaseSeconds: number,
  ) {}

  async execute(): Promise<void> {
    if (this.busy) return

    this.busy = true
    let claimedJob: ClaimedRagIndexJob | null = null
    try {
      const job = await this.claimNextJob.execute()

      if (!job) return

      claimedJob = job
      const renewalIntervalMs = Math.max(1, Math.floor((job.leaseExpiresAt.getTime() - Date.now()) / 3))

      await this.heartbeat(job, {
        stage: RagExecutionStageEnum.LOADING,
        completedUnits: 0,
        totalUnits: null,
      })
      const content = await this.withLeaseRenewal(
        job,
        {
          stage: RagExecutionStageEnum.LOADING,
          completedUnits: 0,
          totalUnits: null,
        },
        renewalIntervalMs,
        () => this.workflow.loadContent(job.documentIndexId),
      )
      await this.heartbeat(job, {
        stage: RagExecutionStageEnum.PLANNING,
        completedUnits: 0,
        totalUnits: null,
      })
      const plan = await this.withLeaseRenewal(
        job,
        {
          stage: RagExecutionStageEnum.PLANNING,
          completedUnits: 0,
          totalUnits: null,
        },
        renewalIntervalMs,
        () => this.chunkPlanner.plan(content),
      )
      await this.heartbeat(job, {
        stage: RagExecutionStageEnum.EMBEDDING,
        completedUnits: 0,
        totalUnits: plan.chunks.length,
      })
      const vectors = await this.withLeaseRenewal(
        job,
        {
          stage: RagExecutionStageEnum.EMBEDDING,
          completedUnits: 0,
          totalUnits: plan.chunks.length,
        },
        renewalIntervalMs,
        () => this.embeddings.embed(plan.chunks.map((chunk) => chunk.content)),
      )

      if (vectors.length !== plan.chunks.length || vectors.some((vector) => vector === undefined)) {
        throw new KnowledgeEmbeddingUnavailableException()
      }

      const lexicalSearchTexts = plan.chunks.map((chunk) => this.lexicalFormatter.format(chunk.content).searchText)
      await this.heartbeat(job, {
        stage: RagExecutionStageEnum.PERSISTING,
        completedUnits: plan.chunks.length,
        totalUnits: plan.chunks.length,
      })
      await this.withLeaseRenewal(
        job,
        {
          stage: RagExecutionStageEnum.PERSISTING,
          completedUnits: plan.chunks.length,
          totalUnits: plan.chunks.length,
        },
        renewalIntervalMs,
        () => this.replaceIndexPlan.execute(job, plan, vectors, lexicalSearchTexts, new Date()),
      )
      await this.completeIndexJob.execute(job, new Date())
    } catch (error) {
      if (claimedJob) {
        try {
          await this.failIndexJob.execute(claimedJob, this.failureDecision(error, claimedJob, new Date()))
        } catch (failureError) {
          if (!(failureError instanceof InvalidRagJobLeaseException)) throw failureError
        }
      }
    } finally {
      this.busy = false
    }
  }

  private async withLeaseRenewal<T>(
    job: ClaimedRagIndexJob,
    progress: RagJobProgress,
    renewalIntervalMs: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    let active = true
    let heartbeatFailed = false
    let rejectHeartbeatFailure: (error: unknown) => void = () => undefined
    const heartbeatFailure = new Promise<never>((_resolve, reject) => {
      rejectHeartbeatFailure = reject
    })

    const scheduleRenewal = (): void => {
      timer = setTimeout(() => {
        void renewLease()
      }, renewalIntervalMs)
    }

    const renewLease = async (): Promise<void> => {
      try {
        await this.heartbeat(job, progress)

        if (active) scheduleRenewal()
      } catch (error) {
        if (active) {
          heartbeatFailed = true
          rejectHeartbeatFailure(error)
        }
      }
    }

    const operationResult = Promise.resolve().then(operation)
    scheduleRenewal()

    try {
      return await Promise.race([operationResult, heartbeatFailure])
    } catch (error) {
      if (heartbeatFailed) await operationResult.catch(() => undefined)

      throw error
    } finally {
      active = false

      if (timer) clearTimeout(timer)
    }
  }

  private async heartbeat(job: ClaimedRagIndexJob, progress: RagJobProgress): Promise<void> {
    const now = new Date()
    const leaseExpiresAt = new RagJob({
      id: job.id,
      status: RAG_JOB_STATUS.RUNNING,
      attempts: job.attempts,
      leaseExpiresAt: job.leaseExpiresAt,
    }).leaseExpiryFrom(now, this.workerLeaseSeconds)
    await this.workflow.heartbeat(job, progress, now, leaseExpiresAt)
  }

  private safeFailureMessage(error: unknown): string {
    if (error instanceof ChunkPlanningUnavailableException) return 'Semantic chunk planning is unavailable'

    if (error instanceof KnowledgeEmbeddingUnavailableException) return 'Knowledge embedding is unavailable'

    return genericFailureMessage
  }

  private failureDecision(error: unknown, job: ClaimedRagIndexJob, failedAt: Date) {
    const transition = new RagJob({
      id: job.id,
      status: RAG_JOB_STATUS.RUNNING,
      attempts: job.attempts,
      leaseExpiresAt: job.leaseExpiresAt,
    }).afterFailure({ errorMessage: this.safeFailureMessage(error), failedAt })

    return {
      errorCode: 'INDEXING_FAILED',
      errorMessage: transition.errorMessage,
      failedAt,
      retryAt: transition.retryAt,
    }
  }
}
