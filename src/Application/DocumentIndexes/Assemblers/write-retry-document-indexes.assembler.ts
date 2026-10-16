import type { DocumentIndexingRetryContext } from '../DataTransferObjects/document-indexing-retry-context.dto.ts'
import type { DocumentIndexingRetryTarget } from '../DataTransferObjects/document-indexing-retry-target.dto.ts'
import type { RetryDocumentIndexingResultDto } from '../DataTransferObjects/retry-document-indexing-result.dto.ts'
import { DocumentIndexingTargetStateEnum } from '../Enums/document-indexing-target-state.enum.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../Helpers/document-index-execution-lifecycle.helper.ts'
import type { EnqueueDocumentIndexingRetryQueryObject } from '../QueryObjects/document-index-execution.query-object.ts'

/** Pure retry persistence and response mapping, without eligibility decisions. */
export class WriteRetryDocumentIndexesAssembler {
  static toDocumentIndexingRetryTarget(
    failedJob: DocumentIndexingRetryContext['failedJob'],
    sourceType: string,
    revisionId: string,
    retryMembership: NonNullable<DocumentIndexingRetryContext['membership']>,
    pipelineHash: string,
  ): DocumentIndexingRetryTarget {
    const expectedMembershipIdentity = {
      requestedGeneration: retryMembership.requestedGeneration,
      activeDocumentIndexId: retryMembership.activeDocumentIndexId,
    }

    return {
      knowledgeBaseId: failedJob.knowledgeBaseId,
      documentId: failedJob.documentId,
      documentIndexId: failedJob.documentIndexId,
      generation: failedJob.generation,
      attempts: failedJob.attempts,
      retriedAt: null,
      sourceType,
      revisionId,
      pipelineHash,
      membership: expectedMembershipIdentity,
      activeJobId: null,
    }
  }

  static toRetryableDocumentIndexExecution(
    retryContext: DocumentIndexingRetryContext,
    availableAt: Date,
    idempotencyKey: string,
    reusableExecutionState: Record<string, unknown> | null,
  ): EnqueueDocumentIndexingRetryQueryObject {
    return {
      knowledgeBaseId: retryContext.failedJob.knowledgeBaseId,
      documentId: retryContext.failedJob.documentId,
      documentIndexId: retryContext.failedJob.documentIndexId,
      generation: retryContext.failedJob.generation,
      status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
      attempts: 0,
      availableAt,
      reservedAt: null,
      leaseToken: null,
      leaseExpiresAt: null,
      idempotencyKey,
      retryOfFailedJobId: retryContext.failedJob.id,
      payload: retryContext.failedJob.retryPayload.input,
      executionState: reusableExecutionState,
      executionVerification: null,
    }
  }

  static toRetryDocumentIndexingResult(jobId: string, failedJobId: string): RetryDocumentIndexingResultDto {
    return { jobId, failedJobId, status: DocumentIndexingTargetStateEnum.QUEUED, retryOfFailedJobId: failedJobId }
  }
}
