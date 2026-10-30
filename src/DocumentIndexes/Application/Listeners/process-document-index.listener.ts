import type { DocumentIndexedListener } from './document-indexed.listener.ts'
import type { DocumentIndexingFailedListener } from './document-indexing-failed.listener.ts'
import type { PlanMarkdownChunksQueryHandlerContract } from '../../../Chunks/Application/Contracts/plan-markdown-chunks.query.handler.contract.ts'
import type { ReplaceIndexChunkCommandHandlerContract } from '../../../Chunks/Application/Contracts/replace-index-chunk.command.handler.contract.ts'
import { ChunkPlanningUnavailableException } from '../../../Chunks/Application/Exceptions/chunk-planning-unavailable.exception.ts'
import type { LoadDocumentRevisionQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/load-document-revision.query.handler.contract.ts'
import type { ReserveDocumentForIndexingCommandHandlerContract } from '../../../Documents/Application/Contracts/reserve-document-for-indexing.command.handler.contract.ts'
import type { ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/reserve-knowledge-base-document-for-indexing.command.handler.contract.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../KnowledgeBases/Application/Exceptions/knowledge-embedding-unavailable.exception.ts'
import { EmbeddingProvider } from '../../../Shared/Application/Ports/Out/Gateways/embedding-provider.ts'
import type { PersistenceTransaction } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'
import { ProcessDocumentIndexAssembler } from '../Assemblers/process-document-index.assembler.ts'
import type { DocumentIndexingDeliveryDTO } from '../DataTransferObjects/document-indexing-delivery.dto.ts'
import type { DocumentIndexingFailureDecision } from '../DataTransferObjects/document-indexing-failure-decision.dto.ts'
import type { DocumentIndexingProgressDTO } from '../DataTransferObjects/document-indexing-progress.dto.ts'
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
import type { DocumentIndexExecutionQueue } from '../Ports/Out/Gateways/document-index-execution.queue.ts'
import type { DocumentIndexRepository } from '../Ports/Out/Repositories/document-index.repository.ts'

const genericFailureMessage = 'RAG indexing failed'

/** Processes a committed job claim through planning, embedding, persistence, and retry outcome. */
export class ProcessDocumentIndexListener {
  constructor(
    private readonly transaction: PersistenceTransaction,
    private readonly reserveDocumentForIndexing: ReserveDocumentForIndexingCommandHandlerContract,
    private readonly reserveKnowledgeBaseDocumentForIndexing: ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly replaceIndexChunk: ReplaceIndexChunkCommandHandlerContract,
    private readonly documentIndexed: Pick<DocumentIndexedListener, 'handle'>,
    private readonly documentIndexingFailed: Pick<DocumentIndexingFailedListener, 'handle'>,
    private readonly embeddings: EmbeddingProvider,
    private readonly chunkPlanner: PlanMarkdownChunksQueryHandlerContract,
    private readonly workerLeaseSeconds: number,
    private readonly loadDocumentRevision: LoadDocumentRevisionQueryHandlerContract,
  ) {}

  async handle(event: DocumentIndexingDispatchedEvent): Promise<void> {
    const job: DocumentIndexingDeliveryDTO = {
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

      const loadingProgress: DocumentIndexingProgressDTO = {
        stage: DocumentIndexExecutionStageEnum.LOADING,
        completedUnits: 0,
        totalUnits: null,
      }
      await this.heartbeat(job, loadingProgress)
      const content = await this.withLeaseRenewal(job, loadingProgress, renewalIntervalMs, () =>
        this.loadContent(job.documentIndexId),
      )
      const planningProgress: DocumentIndexingProgressDTO = {
        stage: DocumentIndexExecutionStageEnum.PLANNING,
        completedUnits: 0,
        totalUnits: null,
      }
      await this.heartbeat(job, planningProgress)
      const plan = await this.withLeaseRenewal(job, planningProgress, renewalIntervalMs, (signal) =>
        this.chunkPlanner.execute({ source: content, signal }),
      )
      const chunkContents = plan.chunks.map((chunk) => chunk.content)
      const embeddingProgress: DocumentIndexingProgressDTO = {
        stage: DocumentIndexExecutionStageEnum.EMBEDDING,
        completedUnits: 0,
        totalUnits: plan.chunks.length,
      }
      await this.heartbeat(job, embeddingProgress)
      const vectors = await this.withLeaseRenewal(job, embeddingProgress, renewalIntervalMs, (signal) =>
        this.embeddings.embed(chunkContents, signal),
      )

      if (vectors.length !== plan.chunks.length || vectors.some((vector) => vector === undefined)) {
        throw new KnowledgeEmbeddingUnavailableException()
      }

      const persistingProgress: DocumentIndexingProgressDTO = {
        stage: DocumentIndexExecutionStageEnum.PERSISTING,
        completedUnits: plan.chunks.length,
        totalUnits: plan.chunks.length,
      }
      await this.heartbeat(job, persistingProgress)
      await this.withLeaseRenewal(job, persistingProgress, renewalIntervalMs, () =>
        this.replaceIndexChunk.execute(
          ProcessDocumentIndexAssembler.toReplaceIndexChunkCommand(job, plan, vectors, new Date()),
        ),
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
    job: DocumentIndexingDeliveryDTO,
    progress: DocumentIndexingProgressDTO,
    renewalIntervalMs: number,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const cancellation = new AbortController()
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

    const operationResult = Promise.resolve().then(() => operation(cancellation.signal))
    scheduleRenewal()

    try {
      return await Promise.race([operationResult, heartbeatFailure])
    } catch (error) {
      if (heartbeatFailed) {
        cancellation.abort(error)
        await operationResult.catch(() => undefined)
      }

      throw error
    } finally {
      active = false

      if (timer) clearTimeout(timer)
    }
  }

  private async heartbeat(job: DocumentIndexingDeliveryDTO, progress: DocumentIndexingProgressDTO): Promise<void> {
    await this.transaction.run(async () => {
      const document = await this.reserveDocumentForIndexing.execute({ documentId: job.documentId })

      if (!document) throw new InvalidDocumentIndexExecutionLeaseException()

      const knowledgeBaseDocument = await this.reserveKnowledgeBaseDocumentForIndexing.execute({
        knowledgeBaseId: job.knowledgeBaseId,
        documentId: job.documentId,
        generation: job.generation,
      })

      if (!knowledgeBaseDocument || knowledgeBaseDocument.requestedGeneration !== job.generation)
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

  private safeFailureCode(error: unknown): string {
    const allowedCodes = new Set([
      'HOST_CLI_BUSY_TIMEOUT',
      'HOST_CLI_REQUEST_TIMED_OUT',
      'HOST_CLI_REQUEST_ABORTED',
      'HOST_CLI_EXECUTION_FAILED',
      'HOST_CLI_OUTPUT_LIMIT_EXCEEDED',
      'HOST_CLI_TURN_INCOMPLETE',
      'HOST_CLI_INVALID_RESPONSE',
      'HOST_CLI_REQUEST_FAILED',
    ])
    const causes = Array.from({ length: 4 }).reduce<unknown[]>(
      (chain) => {
        const current = chain.at(-1)

        if (typeof current === 'object' && current !== null && 'cause' in current) chain.push(current.cause)

        return chain
      },
      [error],
    )

    const safeCode = causes
      .map((cause) =>
        typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string'
          ? cause.code
          : undefined,
      )
      .find((code) => code && (allowedCodes.has(code) || /^HOST_CLI_HTTP_[1-5]\d\d$/.test(code)))

    if (safeCode) return safeCode

    return 'INDEXING_FAILED'
  }

  private failureDecision(
    error: unknown,
    job: DocumentIndexingDeliveryDTO,
    failedAt: Date,
  ): DocumentIndexingFailureDecision {
    const transition = new DocumentIndexExecutionLifecycle({
      id: job.id,
      status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
      attempts: job.attempts,
      leaseExpiresAt: job.leaseExpiresAt,
    }).afterFailure({ errorMessage: this.safeFailureMessage(error), failedAt })

    return {
      errorCode: this.safeFailureCode(error),
      errorMessage: transition.errorMessage,
      failedAt,
      retryAt: transition.retryAt,
    }
  }
}
