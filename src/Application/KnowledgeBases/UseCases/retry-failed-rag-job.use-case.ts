import type { RagConfig } from '../../../../config/rag.config.js'
import {
  RAG_FAILED_JOB_RETRY_OUTCOME_KIND,
  RAG_FAILED_JOB_RETRY_STATUS,
  type RagFailedJobNotRetryableStatus,
} from '../../../Domain/Knowledge/Enums/rag-failed-job-retry-outcome.js'
import { RagJobTargetStateEnum } from '../../../Domain/Knowledge/Enums/rag-job-target-state.enum.js'
import { RagSourceTypeEnum } from '../../../Domain/Knowledge/Enums/rag-source-type.enum.js'
import { KnowledgeIndexPendingException } from '../../../Domain/Knowledge/Exceptions/knowledge-index-pending.exception.js'
import { KnowledgeJobNotFoundException } from '../../../Domain/Knowledge/Exceptions/knowledge-job-not-found.exception.js'
import { RAG_JOB_STATUS } from '../../../Domain/Knowledge/rag-job.js'
import { RagIndexRequestAssembler } from '../Assemblers/rag-index-request.assembler.js'
import { EmbeddingProvider } from '../Contracts/embedding-provider.js'
import { RagCryptographyProvider } from '../Contracts/rag-cryptography-provider.js'
import {
  RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS,
  type RagFailedJobRetryStore,
  type RetryContext,
} from '../Contracts/rag-job-management.js'
import type { RetryFailedJobDto } from '../DataTransferObjects/rag.dto.js'

type RetryPreparationDecision =
  | { kind: typeof RAG_FAILED_JOB_RETRY_OUTCOME_KIND.NOT_RETRYABLE; status: RagFailedJobNotRetryableStatus }
  | {
      kind: typeof RAG_FAILED_JOB_RETRY_OUTCOME_KIND.RETRY
      status: typeof RAG_FAILED_JOB_RETRY_STATUS.QUEUED
      attempts: 0
      payload: Record<string, unknown>
      executionState: Record<string, unknown> | null
    }

const notRetryable = (status: RagFailedJobNotRetryableStatus): RetryPreparationDecision => ({
  kind: RAG_FAILED_JOB_RETRY_OUTCOME_KIND.NOT_RETRYABLE,
  status,
})

const preparationStatus = (facts: RetryContext | null, projectId: string): RagFailedJobNotRetryableStatus | null => {
  if (!facts || facts.knowledgeBase.projectId !== projectId) return RAG_FAILED_JOB_RETRY_STATUS.NOT_FOUND

  if (facts.failedJob.retriedAt) return RAG_FAILED_JOB_RETRY_STATUS.ALREADY_RETRIED

  if (facts.failedJob.attempts !== 4) return RAG_FAILED_JOB_RETRY_STATUS.NOT_CURRENT

  if (!facts.membership) return RAG_FAILED_JOB_RETRY_STATUS.NOT_CURRENT

  if (facts.activeJob) return RAG_FAILED_JOB_RETRY_STATUS.ACTIVE_JOB_EXISTS

  if (
    !facts.document ||
    !facts.document.targetRevision ||
    (facts.document.sourceType !== RagSourceTypeEnum.OBSIDIAN &&
      facts.document.sourceType !== RagSourceTypeEnum.REPOSITORY)
  ) {
    return RAG_FAILED_JOB_RETRY_STATUS.NOT_CURRENT
  }

  return null
}

const decideRetry = (
  facts: RetryContext | null,
  projectId: string,
  expected: {
    knowledgeBaseId: string
    documentId: string
    documentIndexId: string
    generation: number
    sourceType: string
    attempts: number
    revisionId: string
    pipelineHash: string
  },
): RetryPreparationDecision => {
  const status = preparationStatus(facts, projectId)

  if (status) return notRetryable(status)

  if (!facts || !facts.document || !facts.membership) {
    return notRetryable(RAG_FAILED_JOB_RETRY_STATUS.NOT_CURRENT)
  }

  const { failedJob, document, membership, documentIndex } = facts
  const targetRevision = document.targetRevision

  if (!targetRevision) return notRetryable(RAG_FAILED_JOB_RETRY_STATUS.NOT_CURRENT)

  if (
    failedJob.knowledgeBaseId !== expected.knowledgeBaseId ||
    failedJob.documentId !== expected.documentId ||
    failedJob.documentIndexId !== expected.documentIndexId ||
    failedJob.generation !== expected.generation ||
    failedJob.attempts !== expected.attempts ||
    document.sourceType !== expected.sourceType
  ) {
    return notRetryable(RAG_FAILED_JOB_RETRY_STATUS.STALE)
  }

  if (
    membership.requestedGeneration !== expected.generation ||
    targetRevision.id !== expected.revisionId ||
    !documentIndex ||
    documentIndex.documentRevisionId !== expected.revisionId ||
    documentIndex.pipelineHash !== expected.pipelineHash
  ) {
    return notRetryable(RAG_FAILED_JOB_RETRY_STATUS.STALE)
  }

  const reusableProgress = Object.fromEntries(
    Object.entries(failedJob.retryPayload.executionState ?? {}).filter(
      ([key]) =>
        ![
          'lastError',
          'claim_token',
          'claimToken',
          'lease_expires_at',
          'leaseExpiresAt',
          'leaseToken',
          'reservedAt',
          'verifiedAt',
          'executionVerification',
        ].includes(key),
    ),
  )

  return {
    kind: RAG_FAILED_JOB_RETRY_OUTCOME_KIND.RETRY,
    status: RAG_FAILED_JOB_RETRY_STATUS.QUEUED,
    attempts: 0,
    payload: failedJob.retryPayload.input,
    executionState: Object.keys(reusableProgress).length ? reusableProgress : null,
  }
}

const throwForRetryStatus = (status: RagFailedJobNotRetryableStatus, failedJobId: string): never => {
  if (status === RAG_FAILED_JOB_RETRY_STATUS.NOT_FOUND) throw new KnowledgeJobNotFoundException(failedJobId)

  if (status === RAG_FAILED_JOB_RETRY_STATUS.STALE) {
    throw new KnowledgeIndexPendingException('Failed job is stale and cannot be manually retried')
  }

  if (status === RAG_FAILED_JOB_RETRY_STATUS.ALREADY_RETRIED) {
    throw new KnowledgeIndexPendingException('Failed job has already been retried')
  }

  throw new KnowledgeIndexPendingException(`Failed job is no longer retryable: ${status}`)
}

export class RetryFailedRagJobUseCase {
  constructor(
    private readonly failedJobs: RagFailedJobRetryStore,
    private readonly embeddings: EmbeddingProvider,
    private readonly cryptography: RagCryptographyProvider,
    private readonly config: RagConfig,
    private readonly requestAssembler: RagIndexRequestAssembler,
  ) {}

  async execute(projectId: string, failedJobId: string): Promise<RetryFailedJobDto> {
    const retryContext = await this.failedJobs.readRetryContext(failedJobId)

    if (!retryContext) throw new KnowledgeJobNotFoundException(failedJobId)

    const preparation = preparationStatus(retryContext, projectId)

    if (preparation) throwForRetryStatus(preparation, failedJobId)

    const { failedJob, document, membership } = retryContext

    if (!membership) throw new KnowledgeIndexPendingException('Current membership is unavailable')

    if (!document) throw new KnowledgeIndexPendingException('Current source is unavailable')

    const targetRevision = document.targetRevision

    if (!targetRevision) throw new KnowledgeIndexPendingException('Current indexed source revision is unavailable')

    const context = failedJob.retryPayload.input

    if (context === null || typeof context !== 'object' || Array.isArray(context)) {
      throw new TypeError('Failed job retry payload contains an invalid source context')
    }

    const contentSha256 = this.cryptography.sha256(targetRevision.content)
    const expectedPipelineHash = this.cryptography.sha256(
      this.requestAssembler.serializePipelineHashInput({
        contentSha256,
        embeddingModel: this.embeddings.modelId,
        embeddingDimensions: this.config.embeddingDimensions,
        chunkingModel: this.config.chunkingModel,
        context,
      }),
    )

    const expectedTarget = {
      knowledgeBaseId: failedJob.knowledgeBaseId,
      documentId: failedJob.documentId,
      documentIndexId: failedJob.documentIndexId,
      generation: failedJob.generation,
      attempts: failedJob.attempts,
      sourceType: document.sourceType,
      revisionId: targetRevision.id,
      pipelineHash: expectedPipelineHash,
    }
    const preparationDecision = decideRetry(retryContext, projectId, expectedTarget)

    if (preparationDecision.kind === RAG_FAILED_JOB_RETRY_OUTCOME_KIND.NOT_RETRYABLE) {
      return throwForRetryStatus(preparationDecision.status, failedJobId)
    }

    const now = new Date()
    const retryResult = await this.failedJobs.retryFailedJobAtomically({
      projectId,
      failedJobId: failedJob.id,
      expected: {
        knowledgeBaseId: failedJob.knowledgeBaseId,
        documentId: failedJob.documentId,
        documentIndexId: failedJob.documentIndexId,
        generation: failedJob.generation,
        attempts: failedJob.attempts,
        retriedAt: null,
        sourceType: document.sourceType,
        revisionId: targetRevision.id,
        pipelineHash: expectedPipelineHash,
        membership: {
          requestedGeneration: membership.requestedGeneration,
          activeDocumentIndexId: membership.activeDocumentIndexId,
        },
        activeJobId: null,
      },
      retry: {
        status: RAG_JOB_STATUS.QUEUED,
        attempts: preparationDecision.attempts,
        payload: preparationDecision.payload,
        executionState: preparationDecision.executionState,
      },
      now,
      idempotencyKey: this.cryptography.generateIdempotencyKey(),
    })

    if (retryResult.status === RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.NOT_FOUND) {
      throw new KnowledgeJobNotFoundException(failedJob.id)
    }

    if (retryResult.status === RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.STALE) {
      throw new KnowledgeIndexPendingException('Current source changed during retry')
    }

    return {
      jobId: retryResult.jobId,
      failedJobId: failedJob.id,
      status: RagJobTargetStateEnum.QUEUED,
      retryOfFailedJobId: failedJob.id,
    }
  }
}
