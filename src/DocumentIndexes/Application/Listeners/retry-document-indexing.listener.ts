import { createHash, randomUUID } from 'node:crypto'

import type { KnowledgeServiceConfig } from '../../../../config/knowledge-service.config.ts'
import type { GetDocumentRevisionForIndexRetryQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/get-document-revision-for-index-retry.query.handler.contract.ts'
import type { GetDocumentForIndexRetryQueryHandlerContract } from '../../../Documents/Application/Contracts/get-document-for-index-retry.query.handler.contract.ts'
import type { ReserveDocumentForIndexingCommandHandlerContract } from '../../../Documents/Application/Contracts/reserve-document-for-indexing.command.handler.contract.ts'
import type { GetKnowledgeBaseDocumentIndexingStateQueryHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/get-knowledge-base-document-indexing-state.query.handler.contract.ts'
import type { ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/reserve-knowledge-base-document-for-indexing.command.handler.contract.ts'
import type { GetIndexingKnowledgeBaseQueryHandlerContract } from '../../../KnowledgeBases/Application/Contracts/get-indexing-knowledge-base.query.handler.contract.ts'
import { EmbeddingProvider } from '../../../Shared/Application/Ports/Out/Gateways/embedding-provider.ts'
import type { PersistenceTransaction } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'
import { ReadRetryDocumentIndexesAssembler } from '../Assemblers/read-retry-document-indexes.assembler.ts'
import { WriteRequestDocumentIndexesAssembler } from '../Assemblers/write-request-document-indexes.assembler.ts'
import { WriteRetryDocumentIndexesAssembler } from '../Assemblers/write-retry-document-indexes.assembler.ts'
import type { DocumentIndexingRetryContext } from '../DataTransferObjects/document-indexing-retry-context.dto.ts'
import type { DocumentIndexingRetryTarget } from '../DataTransferObjects/document-indexing-retry-target.dto.ts'
import type { RetryDocumentIndexingResultDTO } from '../DataTransferObjects/retry-document-indexing-result.dto.ts'
import type { RetryDocumentIndexingDTO } from '../DataTransferObjects/retry-document-indexing.dto.ts'
import type { RetryUnretriedDocumentIndexFailuresResultDTO } from '../DataTransferObjects/retry-unretried-document-index-failures-result.dto.ts'
import {
  DOCUMENT_INDEX_FAILURE_RETRY_STATUS,
  type DocumentIndexingNotRetryableStatus,
} from '../Enums/document-indexing-retry-outcome.ts'
import { ActiveDocumentIndexExecutionPreventsRetryException } from '../Exceptions/active-document-index-execution-prevents-retry.exception.ts'
import { DocumentIndexingFailureAlreadyRetriedException } from '../Exceptions/document-indexing-failure-already-retried.exception.ts'
import { DocumentIndexingFailureNotCurrentException } from '../Exceptions/document-indexing-failure-not-current.exception.ts'
import { DocumentIndexingNotFoundException } from '../Exceptions/document-indexing-not-found.exception.ts'
import { IndexRetryRevisionUnavailableException } from '../Exceptions/index-retry-revision-unavailable.exception.ts'
import { IndexRetrySourceChangedException } from '../Exceptions/index-retry-source-changed.exception.ts'
import { IndexRetrySourceUnavailableException } from '../Exceptions/index-retry-source-unavailable.exception.ts'
import { InvalidIndexRetrySourceContextException } from '../Exceptions/invalid-index-retry-source-context.exception.ts'
import { StaleDocumentIndexingFailureException } from '../Exceptions/stale-document-indexing-failure.exception.ts'
import type { DocumentIndexExecutionQueue } from '../Ports/Out/Gateways/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../Ports/Out/Gateways/document-index-failure.archive.ts'
import type {
  UnretriedDocumentIndexFailureTargetParams,
  UnretriedDocumentIndexFailuresParams,
} from '../Ports/Out/Gateways/document-index-failure.params.ts'
import type { DocumentIndexRepository } from '../Ports/Out/Repositories/document-index.repository.ts'

const NON_RETRYABLE_ERROR_CODES = new Set([
  'KNOWLEDGE_JOB_NOT_FOUND',
  'DOCUMENT_INDEXING_FAILURE_ALREADY_RETRIED',
  'ACTIVE_DOCUMENT_INDEX_EXECUTION_PREVENTS_RETRY',
  'DOCUMENT_INDEXING_FAILURE_NOT_CURRENT',
  'STALE_DOCUMENT_INDEXING_FAILURE',
])

const retryFailureReason = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown retry failure'

const isNonRetryableError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && NON_RETRYABLE_ERROR_CODES.has(String(error.code))

const TRANSIENT_EXECUTION_FIELDS = new Set([
  'lastError',
  'claim_token',
  'claimToken',
  'lease_expires_at',
  'leaseExpiresAt',
  'leaseToken',
  'reservedAt',
  'verifiedAt',
  'executionVerification',
])

const preparationStatus = (
  retryContext: DocumentIndexingRetryContext | null,
  projectId: string,
): DocumentIndexingNotRetryableStatus | null => {
  if (retryContext === null || retryContext.knowledgeBase.projectId !== projectId)
    return DOCUMENT_INDEX_FAILURE_RETRY_STATUS.NOT_FOUND

  if (retryContext.failedJob.retriedAt !== null) return DOCUMENT_INDEX_FAILURE_RETRY_STATUS.ALREADY_RETRIED

  if (retryContext.failedJob.attempts !== 4) return DOCUMENT_INDEX_FAILURE_RETRY_STATUS.NOT_CURRENT

  if (retryContext.knowledgeBaseDocument === null) return DOCUMENT_INDEX_FAILURE_RETRY_STATUS.NOT_CURRENT

  if (retryContext.activeJob !== null) return DOCUMENT_INDEX_FAILURE_RETRY_STATUS.ACTIVE_JOB_EXISTS

  if (retryContext.document === null || retryContext.document.targetRevision === null) {
    return DOCUMENT_INDEX_FAILURE_RETRY_STATUS.NOT_CURRENT
  }

  return null
}

const isCurrentTarget = (retryContext: DocumentIndexingRetryContext, expectedPipelineHash: string): boolean => {
  if (
    retryContext.document === null ||
    retryContext.knowledgeBaseDocument === null ||
    retryContext.documentIndex === null
  )
    return false

  if (retryContext.document.targetRevision === null) return false

  return (
    retryContext.failedJob.generation === retryContext.knowledgeBaseDocument.requestedGeneration &&
    retryContext.documentIndex.documentRevisionId === retryContext.document.targetRevision.id &&
    retryContext.documentIndex.pipelineHash === expectedPipelineHash
  )
}

const matchesExpected = (
  retryContext: DocumentIndexingRetryContext,
  expectedRetryTarget: DocumentIndexingRetryTarget,
): boolean => {
  if (
    retryContext.document === null ||
    retryContext.knowledgeBaseDocument === null ||
    retryContext.documentIndex === null
  )
    return false

  const targetRevision = retryContext.document.targetRevision

  if (targetRevision === null) return false

  const activeJobId = retryContext.activeJob === null ? null : retryContext.activeJob.id

  return (
    retryContext.failedJob.knowledgeBaseId === expectedRetryTarget.knowledgeBaseId &&
    retryContext.failedJob.documentId === expectedRetryTarget.documentId &&
    retryContext.failedJob.documentIndexId === expectedRetryTarget.documentIndexId &&
    retryContext.failedJob.generation === expectedRetryTarget.generation &&
    retryContext.failedJob.attempts === expectedRetryTarget.attempts &&
    retryContext.failedJob.retriedAt === expectedRetryTarget.retriedAt &&
    retryContext.document.sourceType === expectedRetryTarget.sourceType &&
    targetRevision.id === expectedRetryTarget.revisionId &&
    retryContext.documentIndex.documentRevisionId === expectedRetryTarget.revisionId &&
    retryContext.documentIndex.pipelineHash === expectedRetryTarget.pipelineHash &&
    retryContext.knowledgeBaseDocument.requestedGeneration ===
      expectedRetryTarget.knowledgeBaseDocument.requestedGeneration &&
    retryContext.knowledgeBaseDocument.activeDocumentIndexId ===
      expectedRetryTarget.knowledgeBaseDocument.activeDocumentIndexId &&
    activeJobId === expectedRetryTarget.activeJobId
  )
}

const throwForRetryStatus = (retryStatus: DocumentIndexingNotRetryableStatus, failedJobId: string): never => {
  if (retryStatus === DOCUMENT_INDEX_FAILURE_RETRY_STATUS.NOT_FOUND)
    throw new DocumentIndexingNotFoundException(failedJobId)

  if (retryStatus === DOCUMENT_INDEX_FAILURE_RETRY_STATUS.STALE) {
    throw new StaleDocumentIndexingFailureException()
  }

  if (retryStatus === DOCUMENT_INDEX_FAILURE_RETRY_STATUS.ALREADY_RETRIED) {
    throw new DocumentIndexingFailureAlreadyRetriedException()
  }

  if (retryStatus === DOCUMENT_INDEX_FAILURE_RETRY_STATUS.ACTIVE_JOB_EXISTS) {
    throw new ActiveDocumentIndexExecutionPreventsRetryException()
  }

  throw new DocumentIndexingFailureNotCurrentException()
}

export class RetryDocumentIndexingListener {
  constructor(
    private readonly transaction: PersistenceTransaction,
    private readonly knowledgeBases: GetIndexingKnowledgeBaseQueryHandlerContract,
    private readonly documents: GetDocumentForIndexRetryQueryHandlerContract,
    private readonly knowledgeBaseDocuments: GetKnowledgeBaseDocumentIndexingStateQueryHandlerContract,
    private readonly revisions: GetDocumentRevisionForIndexRetryQueryHandlerContract,
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexFailureArchive: DocumentIndexFailureArchive,
    private readonly embeddings: EmbeddingProvider,
    private readonly config: KnowledgeServiceConfig,
    private readonly writeRequestDocumentIndexesAssembler: WriteRequestDocumentIndexesAssembler,
    private readonly reserveDocumentForIndexing: ReserveDocumentForIndexingCommandHandlerContract,
    private readonly reserveKnowledgeBaseDocumentForIndexing: ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
  ) {}

  async retryCurrentTarget(
    target: UnretriedDocumentIndexFailureTargetParams & { readonly projectId: string },
  ): Promise<RetryDocumentIndexingResultDTO> {
    const failure = await this.documentIndexFailureArchive.findUnretriedTargetFailure(target)

    if (failure === null) throw new DocumentIndexingFailureNotCurrentException()

    return this.handle({ projectId: target.projectId, failedJobId: failure.id })
  }

  async retryUnretriedFailures(
    query: UnretriedDocumentIndexFailuresParams,
  ): Promise<RetryUnretriedDocumentIndexFailuresResultDTO> {
    const failedJobIds =
      await this.documentIndexFailureArchive.findByRetriedAtIsNullAndFailedAtLessThanOrEqualCutoffOrderByFailedAtAscAndIdAsc(
        query,
      )
    const initial: RetryUnretriedDocumentIndexFailuresResultDTO = { queued: [], skipped: [], failures: [] }
    const result = await failedJobIds.reduce(
      (previous, failedJobId) =>
        previous.then(async (summary) => {
          const outcome = await this.retryUnretriedFailure(failedJobId, query.projectId)

          return {
            queued: [...summary.queued, ...outcome.queued],
            skipped: [...summary.skipped, ...outcome.skipped],
            failures: [...summary.failures, ...outcome.failures],
          }
        }),
      Promise.resolve(initial),
    )

    if (query.failedJobId !== undefined && failedJobIds.length === 0) {
      return {
        ...result,
        skipped: [...result.skipped, { failedJobId: query.failedJobId, reason: 'No eligible unretried failure found' }],
      }
    }

    return result
  }

  private async retryUnretriedFailure(
    failedJobId: string,
    projectId?: string,
  ): Promise<RetryUnretriedDocumentIndexFailuresResultDTO> {
    try {
      const failure = await this.documentIndexFailureArchive.findFailure({ id: failedJobId })

      if (failure === null) {
        return { queued: [], skipped: [{ failedJobId, reason: 'Failure no longer exists' }], failures: [] }
      }

      const knowledgeBase = await this.knowledgeBases.execute({ knowledgeBaseId: failure.knowledgeBaseId })

      if (knowledgeBase === null || (projectId !== undefined && knowledgeBase.projectId !== projectId)) {
        return {
          queued: [],
          skipped: [{ failedJobId, reason: 'Failure is outside the requested project' }],
          failures: [],
        }
      }

      const retry = await this.handle({ projectId: knowledgeBase.projectId, failedJobId })

      if (retry.jobId === null) {
        return { queued: [], skipped: [], failures: [{ failedJobId, reason: 'Retry returned no queued job' }] }
      }

      return { queued: [{ failedJobId, jobId: retry.jobId }], skipped: [], failures: [] }
    } catch (error) {
      const outcome = isNonRetryableError(error) ? 'skipped' : 'failures'
      const item = { failedJobId, reason: retryFailureReason(error) }

      return outcome === 'skipped'
        ? { queued: [], skipped: [item], failures: [] }
        : { queued: [], skipped: [], failures: [item] }
    }
  }

  async handle({ projectId, failedJobId }: RetryDocumentIndexingDTO): Promise<RetryDocumentIndexingResultDTO> {
    const retryContext = await this.transaction.run(() => this.readByFailedJobIdWithRetryContextProjection(failedJobId))
    const retryPreparationStatus = preparationStatus(retryContext, projectId)

    if (retryPreparationStatus !== null) throwForRetryStatus(retryPreparationStatus, failedJobId)

    if (retryContext === null) throw new DocumentIndexingNotFoundException(failedJobId)

    const { failedJob: failedJob, document: sourceDocument } = retryContext

    if (sourceDocument === null) throw new IndexRetrySourceUnavailableException()

    const targetRevision = sourceDocument.targetRevision

    if (targetRevision === null) {
      throw new IndexRetryRevisionUnavailableException()
    }

    const sourceContext = failedJob.retryPayload.input

    if (sourceContext === null || typeof sourceContext !== 'object' || Array.isArray(sourceContext)) {
      throw new InvalidIndexRetrySourceContextException()
    }

    const contentSha256 = createHash('sha256').update(targetRevision.content).digest('hex')
    const expectedPipelineHash = createHash('sha256')
      .update(
        this.writeRequestDocumentIndexesAssembler.serializeDocumentIndexPipelineHashInput({
          contentSha256,
          embeddingModel: this.embeddings.modelId,
          embeddingDimensions: this.config.embeddingDimensions,
          chunkingModel: this.config.chunkingModel,
          context: sourceContext,
        }),
      )
      .digest('hex')

    if (!isCurrentTarget(retryContext, expectedPipelineHash)) {
      throwForRetryStatus(DOCUMENT_INDEX_FAILURE_RETRY_STATUS.STALE, failedJobId)
    }

    const retryKnowledgeBaseDocument = retryContext.knowledgeBaseDocument

    if (retryKnowledgeBaseDocument === null) throw new DocumentIndexingFailureNotCurrentException()

    const expectedRetryTarget = WriteRetryDocumentIndexesAssembler.toDocumentIndexingRetryTarget(
      failedJob,
      sourceDocument.sourceType,
      targetRevision.id,
      retryKnowledgeBaseDocument,
      expectedPipelineHash,
    )
    const retriedAt = new Date()
    const idempotencyKey = randomUUID()
    const jobId = await this.transaction.run(async () => {
      const candidateRetryContext = await this.readByFailedJobIdWithRetryContextProjection(failedJobId)

      if (candidateRetryContext === null || candidateRetryContext.knowledgeBase.projectId !== projectId) {
        throw new DocumentIndexingNotFoundException(failedJobId)
      }

      // Keep document → knowledgeBaseDocument → failed-job locking identical to indexing and pruning.
      const lockedDocument = await this.reserveDocumentForIndexing.execute({
        documentId: candidateRetryContext.failedJob.documentId,
      })
      let lockedKnowledgeBaseDocument = false

      if (lockedDocument) {
        const knowledgeBaseDocumentReservation = await this.reserveKnowledgeBaseDocumentForIndexing.execute({
          knowledgeBaseId: candidateRetryContext.failedJob.knowledgeBaseId,
          documentId: candidateRetryContext.failedJob.documentId,
        })
        lockedKnowledgeBaseDocument = knowledgeBaseDocumentReservation !== null
      }

      const lockedFailedJob = await this.documentIndexFailureArchive.lockFailure({ failedJobId })
      const lockedRetryContext = await this.readByFailedJobIdWithRetryContextProjection(failedJobId)

      if (!lockedFailedJob || lockedRetryContext === null || lockedRetryContext.knowledgeBase.projectId !== projectId) {
        throw new DocumentIndexingNotFoundException(failedJobId)
      }

      if (
        !lockedDocument ||
        !lockedKnowledgeBaseDocument ||
        !matchesExpected(lockedRetryContext, expectedRetryTarget)
      ) {
        throw new IndexRetrySourceChangedException()
      }

      const retryableJob = WriteRetryDocumentIndexesAssembler.toRetryableDocumentIndexExecution(
        lockedRetryContext,
        retriedAt,
        idempotencyKey,
        this.reusableExecutionStateForRetry(lockedRetryContext.failedJob.retryPayload.executionState),
      )
      await this.documentIndexExecutionQueue.enqueueRetry(retryableJob)
      await this.documentIndexFailureArchive.removeFailure({ failedJobId })

      return retryableJob.id
    })

    return WriteRetryDocumentIndexesAssembler.toRetryDocumentIndexingResult(jobId, failedJobId)
  }

  private reusableExecutionStateForRetry(
    executionState: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (executionState === null) return null

    // A manual retry keeps durable progress but must start with a fresh lease and no previous error.
    const reusableExecutionState = Object.fromEntries(
      Object.entries(executionState).filter(([executionField]) => !TRANSIENT_EXECUTION_FIELDS.has(executionField)),
    )

    return Object.keys(reusableExecutionState).length === 0 ? null : reusableExecutionState
  }

  private async readByFailedJobIdWithRetryContextProjection(
    failedJobId: string,
  ): Promise<DocumentIndexingRetryContext | null> {
    const failedJobRecord = await this.documentIndexFailureArchive.findFailure({ id: failedJobId })

    if (failedJobRecord === null) return null

    const knowledgeBaseRecord = await this.knowledgeBases.execute({
      knowledgeBaseId: failedJobRecord.knowledgeBaseId,
    })

    if (knowledgeBaseRecord === null) return null

    const knowledgeBaseDocumentQO = {
      knowledgeBaseId: failedJobRecord.knowledgeBaseId,
      documentId: failedJobRecord.documentId,
    }
    const documentRecord = await this.documents.execute({ documentId: failedJobRecord.documentId })
    const knowledgeBaseDocumentRecord = await this.knowledgeBaseDocuments.execute(knowledgeBaseDocumentQO)
    const documentIndexRecord = await this.documentIndexRepository.findByDocumentIndexId({
      documentIndexId: failedJobRecord.documentIndexId,
    })
    const activeJobRecord =
      await this.documentIndexExecutionQueue.findKnowledgeBaseDocumentExecution(knowledgeBaseDocumentQO)
    let targetDocumentRevisionRecord = null

    if (documentIndexRecord !== null) {
      targetDocumentRevisionRecord = await this.revisions.execute({
        documentId: failedJobRecord.documentId,
        revisionId: documentIndexRecord.revisionId,
      })
    }

    return ReadRetryDocumentIndexesAssembler.toDocumentIndexingRetryContext({
      failedJob: failedJobRecord,
      knowledgeBase: knowledgeBaseRecord,
      document: documentRecord,
      knowledgeBaseDocument: knowledgeBaseDocumentRecord,
      index: documentIndexRecord,
      activeJob: activeJobRecord,
      targetRevision: targetDocumentRevisionRecord,
    })
  }
}
