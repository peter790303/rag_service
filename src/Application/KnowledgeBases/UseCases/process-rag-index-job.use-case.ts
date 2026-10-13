import { RagExecutionStageEnum } from '../../../Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { ChunkPlanningUnavailableException } from '../../../Domain/Knowledge/Exceptions/chunk-planning-unavailable.exception.js'
import { InvalidRagJobLeaseException } from '../../../Domain/Knowledge/Exceptions/invalid-rag-job-lease.exception.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'
import {
  RagIndexingStore,
  type ClaimedRagIndexJob,
  type RagJobProgress,
} from '../../../Infrastructure/Persistence/Repositories/Contracts/rag-indexing-store.js'
import { ChunkPlanningProvider } from '../Contracts/chunk-planning-provider.js'
import { EmbeddingProvider } from '../Contracts/embedding-provider.js'

const MAX_INDEXING_ATTEMPTS = 4
const MAX_RETRY_DELAY_MS = 60_000
const genericFailureMessage = 'RAG indexing failed'

const safeFailureMessage = (error: unknown): string => {
  if (error instanceof ChunkPlanningUnavailableException) return 'Semantic chunk planning is unavailable'

  if (error instanceof KnowledgeEmbeddingUnavailableException) return 'Knowledge embedding is unavailable'

  return genericFailureMessage
}

type IndexingFailureDecision = {
  errorCode: string
  errorMessage: string
  retryAt: Date | null
  terminal: boolean
}

const failureDecision = (error: unknown, attempts: number, failedAt: Date): IndexingFailureDecision => {
  const terminal = attempts >= MAX_INDEXING_ATTEMPTS
  const retryDelayMs = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** attempts)

  return {
    errorCode: 'INDEXING_FAILED',
    errorMessage: safeFailureMessage(error),
    retryAt: terminal ? null : new Date(failedAt.getTime() + retryDelayMs),
    terminal,
  }
}

/** Orchestrates queue claim, content planning, embedding, persistence, and retry outcome. */
export class ProcessRagIndexJobUseCase {
  private busy = false

  constructor(
    private readonly store: RagIndexingStore,
    private readonly embeddings: EmbeddingProvider,
    private readonly chunkPlanner: ChunkPlanningProvider,
  ) {}

  async execute(): Promise<void> {
    if (this.busy) return

    this.busy = true
    let claimedJob: ClaimedRagIndexJob | null = null
    try {
      const job = await this.store.claimNext()

      if (!job) return

      claimedJob = job

      await this.store.heartbeat(job, {
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
        () => this.store.loadContent(job.documentIndexId),
      )
      await this.store.heartbeat(job, {
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
        () => this.chunkPlanner.plan(content),
      )
      await this.store.heartbeat(job, {
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
        () => this.embeddings.embed(plan.chunks.map((chunk) => chunk.content)),
      )
      await this.store.heartbeat(job, {
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
        () => this.store.savePlan(job, plan, vectors),
      )
      await this.store.complete(job)
    } catch (error) {
      if (claimedJob) {
        try {
          await this.store.fail(claimedJob, failureDecision(error, claimedJob.attempts, new Date()))
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
    operation: () => Promise<T>,
  ): Promise<T> {
    const remainingLeaseMs = job.leaseExpiresAt.getTime() - Date.now()
    const renewalIntervalMs = Math.max(1, Math.floor(remainingLeaseMs / 3))
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
        await this.store.heartbeat(job, progress)

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
}
