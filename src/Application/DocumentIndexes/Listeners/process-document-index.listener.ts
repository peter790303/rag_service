import type { DocumentIndexedListener } from './document-indexed.listener.ts'
import type { DocumentIndexingFailedListener } from './document-indexing-failed.listener.ts'
import { ChunkPlanningProvider } from '../../Chunks/Contracts/chunk-planning-provider.ts'
import type { ReplaceIndexChunkUseCaseContract } from '../../Chunks/Contracts/replace-index-chunk.use-case.contract.ts'
import { ChunkPlanningUnavailableException } from '../../Chunks/Exceptions/chunk-planning-unavailable.exception.ts'
import type { LoadDocumentRevisionUseCaseContract } from '../../DocumentRevisions/Contracts/load-document-revision.use-case.contract.ts'
import type { ReserveDocumentForIndexingUseCaseContract } from '../../Documents/Contracts/reserve-document-for-indexing.use-case.contract.ts'
import { EmbeddingProvider } from '../../KnowledgeBases/Contracts/embedding-provider.ts'
import type { PersistenceTransaction } from '../../KnowledgeBases/Contracts/persistence-transaction.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../KnowledgeBases/Exceptions/knowledge-embedding-unavailable.exception.ts'
import type { ReserveMembershipForIndexingUseCaseContract } from '../../Memberships/Contracts/reserve-membership-for-indexing.use-case.contract.ts'
import type { DocumentIndexExecutionQueue } from '../Contracts/document-index-execution.queue.ts'
import type { DocumentIndexRepository } from '../Contracts/document-index.repository.ts'
import type { DocumentIndexingDeliveryDto } from '../DataTransferObjects/document-indexing-delivery.dto.ts'
import type { DocumentIndexingFailureDecision } from '../DataTransferObjects/document-indexing-failure-decision.dto.ts'
import type { DocumentIndexingProgressDto } from '../DataTransferObjects/document-indexing-progress.dto.ts'
import { DocumentIndexExecutionStageEnum } from '../Enums/document-index-execution-stage.enum.ts'
import { DocumentIndexedEvent } from '../Events/document-indexed.event.ts'
import type { DocumentIndexingDispatchedEvent } from '../Events/document-indexing-dispatched.event.ts'
import { DocumentIndexingFailedEvent } from '../Events/document-indexing-failed.event.ts'
import { IndexDisappearedBeforeCompletionException } from '../Exceptions/index-disappeared-before-completion.exception.ts'
import { IndexRevisionUnavailableException } from '../Exceptions/index-revision-unavailable.exception.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../Exceptions/invalid-document-index-execution-lease.exception.ts'
import {
  DocumentIndexExecutionLifecycle,
  DOCUMENT_INDEX_EXECUTION_STATUS,
} from '../Helpers/document-index-execution-lifecycle.helper.ts'

const genericFailureMessage = 'RAG indexing failed'

/** Processes a committed job claim through planning, embedding, persistence, and retry outcome. */
export class ProcessDocumentIndexListener {
  constructor(
    private readonly transaction: PersistenceTransaction,
    private readonly reserveDocumentForIndexing: ReserveDocumentForIndexingUseCaseContract,
    private readonly reserveMembershipForIndexing: ReserveMembershipForIndexingUseCaseContract,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly replaceIndexChunk: ReplaceIndexChunkUseCaseContract,
    private readonly documentIndexed: Pick<DocumentIndexedListener, 'handle'>,
    private readonly documentIndexingFailed: Pick<DocumentIndexingFailedListener, 'handle'>,
    private readonly embeddings: EmbeddingProvider,
    private readonly chunkPlanner: ChunkPlanningProvider,
    private readonly workerLeaseSeconds: number,
    private readonly loadDocumentRevision: LoadDocumentRevisionUseCaseContract,
  ) {}

  async handle(event: DocumentIndexingDispatchedEvent): Promise<void> {
    const job: DocumentIndexingDeliveryDto = {
      id: event.jobId,
      knowledgeBaseId: event.knowledgeBaseId,
      documentId: event.documentId,
      documentIndexId: event.documentIndexId,
      generation: event.generation,
      attempts: event.attempts,
      leaseToken: event.leaseToken,
      leaseExpiresAt: new Date(event.leaseExpiresAt),
    }

    try {
      const renewalIntervalMs = Math.max(1, Math.floor((job.leaseExpiresAt.getTime() - Date.now()) / 3))

      const loadingProgress: DocumentIndexingProgressDto = {
        stage: DocumentIndexExecutionStageEnum.LOADING,
        completedUnits: 0,
        totalUnits: null,
      }
      await this.heartbeat(job, loadingProgress)
      const content = await this.withLeaseRenewal(job, loadingProgress, renewalIntervalMs, () =>
        this.loadContent(job.documentIndexId),
      )
      const planningProgress: DocumentIndexingProgressDto = {
        stage: DocumentIndexExecutionStageEnum.PLANNING,
        completedUnits: 0,
        totalUnits: null,
      }
      await this.heartbeat(job, planningProgress)
      const plan = await this.withLeaseRenewal(job, planningProgress, renewalIntervalMs, () =>
        this.chunkPlanner.plan(content),
      )
      const chunkContents = plan.chunks.map((chunk) => chunk.content)
      const embeddingProgress: DocumentIndexingProgressDto = {
        stage: DocumentIndexExecutionStageEnum.EMBEDDING,
        completedUnits: 0,
        totalUnits: plan.chunks.length,
      }
      await this.heartbeat(job, embeddingProgress)
      const vectors = await this.withLeaseRenewal(job, embeddingProgress, renewalIntervalMs, () =>
        this.embeddings.embed(chunkContents),
      )

      if (vectors.length !== plan.chunks.length || vectors.some((vector) => vector === undefined)) {
        throw new KnowledgeEmbeddingUnavailableException()
      }

      const persistingProgress: DocumentIndexingProgressDto = {
        stage: DocumentIndexExecutionStageEnum.PERSISTING,
        completedUnits: plan.chunks.length,
        totalUnits: plan.chunks.length,
      }
      await this.heartbeat(job, persistingProgress)
      await this.withLeaseRenewal(job, persistingProgress, renewalIntervalMs, () =>
        this.replaceIndexChunk.execute({
          job: job,
          markdownChunkPlan: plan,
          chunkEmbeddings: vectors,
          now: new Date(),
        }),
      )
      await this.documentIndexed.handle(new DocumentIndexedEvent({ jobDelivery: job, completedAt: new Date() }))
    } catch (error) {
      try {
        await this.documentIndexingFailed.handle(
          new DocumentIndexingFailedEvent({
            jobDelivery: job,
            failureDecision: this.failureDecision(error, job, new Date()),
          }),
        )
      } catch (failureError) {
        if (!(failureError instanceof InvalidDocumentIndexExecutionLeaseException)) throw failureError
      }
    }
  }

  private async loadContent(documentIndexId: string): Promise<string> {
    const documentIndex = await this.documentIndexRepository.findByDocumentIndexId({ documentIndexId })

    if (documentIndex === null) throw new IndexDisappearedBeforeCompletionException()

    const revision = await this.loadDocumentRevision.execute({ revisionId: documentIndex.revisionId })

    if (revision === null) throw new IndexRevisionUnavailableException()

    return revision.content
  }

  private async withLeaseRenewal<T>(
    job: DocumentIndexingDeliveryDto,
    progress: DocumentIndexingProgressDto,
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

  private async heartbeat(job: DocumentIndexingDeliveryDto, progress: DocumentIndexingProgressDto): Promise<void> {
    await this.transaction.run(async () => {
      const document = await this.reserveDocumentForIndexing.execute({ documentId: job.documentId })

      if (!document) throw new InvalidDocumentIndexExecutionLeaseException()

      const membership = await this.reserveMembershipForIndexing.execute({
        knowledgeBaseId: job.knowledgeBaseId,
        documentId: job.documentId,
        generation: job.generation,
      })

      if (!membership || membership.requestedGeneration !== job.generation)
        throw new InvalidDocumentIndexExecutionLeaseException()

      const record = await this.documentIndexExecutionQueue.lockExecution({ jobId: job.id })
      const reservedAt = new Date()

      if (!record) throw new InvalidDocumentIndexExecutionLeaseException()

      if (
        record.id !== job.id ||
        record.knowledgeBaseId !== job.knowledgeBaseId ||
        record.documentId !== job.documentId ||
        record.documentIndexId !== job.documentIndexId ||
        record.generation !== job.generation ||
        record.attempts !== job.attempts ||
        record.status !== DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING ||
        record.leaseToken !== job.leaseToken
      ) {
        throw new InvalidDocumentIndexExecutionLeaseException()
      }

      const lease = new DocumentIndexExecutionLifecycle({
        id: record.id,
        status: record.status,
        attempts: record.attempts,
        leaseExpiresAt: record.leaseExpiresAt,
      })
      const leaseExpiresAt = lease.leaseExpiryFrom(reservedAt, this.workerLeaseSeconds)

      if (!lease.canRenewLeaseAt(reservedAt, leaseExpiresAt)) throw new InvalidDocumentIndexExecutionLeaseException()

      const verification = {
        stage: progress.stage,
        completedUnits: progress.completedUnits,
        totalUnits: progress.totalUnits,
        verifiedAt: reservedAt.toISOString(),
        claimToken: job.leaseToken,
        leaseExpiresAt: leaseExpiresAt.toISOString(),
      }
      await this.documentIndexExecutionQueue.renewLease({
        jobId: job.id,
        reservedAt: reservedAt,
        leaseExpiresAt,
        executionVerification: verification,
      })
    })
  }

  private safeFailureMessage(error: unknown): string {
    if (error instanceof ChunkPlanningUnavailableException) return 'Semantic chunk planning is unavailable'

    if (error instanceof KnowledgeEmbeddingUnavailableException) return 'Knowledge embedding is unavailable'

    return genericFailureMessage
  }

  private failureDecision(
    error: unknown,
    job: DocumentIndexingDeliveryDto,
    failedAt: Date,
  ): DocumentIndexingFailureDecision {
    const transition = new DocumentIndexExecutionLifecycle({
      id: job.id,
      status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
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
