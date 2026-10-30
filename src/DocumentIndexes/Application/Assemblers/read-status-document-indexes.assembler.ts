import type { KnowledgeBaseDocument } from '../../../KnowledgeBases/Domain/Entities/knowledge-base-document.ts'
import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import type { DocumentIndexExecutionRecordDTO } from '../DataTransferObjects/document-index-execution-record.dto.ts'
import type { DocumentIndexExecutionVerificationDTO } from '../DataTransferObjects/document-index-execution-verification.dto.ts'
import type { DocumentIndexFailureRecordDTO } from '../DataTransferObjects/document-index-failure-record.dto.ts'
import type { DocumentIndexSuccessReceiptDTO } from '../DataTransferObjects/document-index-success-receipt.dto.ts'
import type { DocumentIndexingStatusFacts } from '../DataTransferObjects/document-indexing-status-facts.dto.ts'
import type { DocumentIndexingStatusSourceDTO } from '../DataTransferObjects/document-indexing-status-source.dto.ts'
import type { DocumentIndexingStatusDTO } from '../DataTransferObjects/document-indexing-status.dto.ts'
import { DocumentIndexExecutionStageEnum } from '../Enums/document-index-execution-stage.enum.ts'
import { DocumentIndexingTargetStateEnum } from '../Enums/document-indexing-target-state.enum.ts'

type RequestedTarget = NonNullable<DocumentIndexingStatusFacts['requestedTarget']>

/** Projects status facts after the use case has chosen the target state. */
export class ReadStatusDocumentIndexesAssembler {
  static toActiveIndexingStatusSource(activeJob: DocumentIndexExecutionRecordDTO): DocumentIndexingStatusSourceDTO {
    return {
      knowledgeBaseId: activeJob.knowledgeBaseId,
      documentId: activeJob.documentId,
      indexId: activeJob.documentIndexId,
      generation: activeJob.generation,
      activeJobStatus: activeJob.status,
      hasSuccessfulReceipt: false,
      jobId: activeJob.id,
      failedJobId: null,
      attempts: activeJob.attempts,
      errorCode: null,
      errorMessage: null,
      executionVerification: this.restoreDocumentIndexExecutionVerification(activeJob.executionVerification),
    }
  }

  static toFailedIndexingStatusSource(failedJob: DocumentIndexFailureRecordDTO): DocumentIndexingStatusSourceDTO {
    return {
      knowledgeBaseId: failedJob.knowledgeBaseId,
      documentId: failedJob.documentId,
      indexId: failedJob.documentIndexId,
      generation: failedJob.generation,
      activeJobStatus: null,
      hasSuccessfulReceipt: false,
      jobId: null,
      failedJobId: failedJob.id,
      attempts: failedJob.attempts,
      errorCode: failedJob.errorCode,
      errorMessage: failedJob.errorMessage,
      executionVerification: null,
    }
  }

  static toSuccessfulIndexingStatusSource(
    successReceipt: DocumentIndexSuccessReceiptDTO,
  ): DocumentIndexingStatusSourceDTO {
    return {
      knowledgeBaseId: successReceipt.knowledgeBaseId,
      documentId: successReceipt.documentId,
      indexId: successReceipt.documentIndexId,
      generation: successReceipt.generation,
      activeJobStatus: null,
      hasSuccessfulReceipt: true,
      jobId: successReceipt.jobId,
      failedJobId: null,
      attempts: successReceipt.attempts,
      errorCode: null,
      errorMessage: null,
      executionVerification: this.restoreDocumentIndexExecutionVerification(successReceipt.executionVerification),
    }
  }

  static toDocumentIndexingStatusFacts(
    source: DocumentIndexingStatusSourceDTO,
    knowledgeBaseDocument: KnowledgeBaseDocument | null,
    activeIndex: DocumentIndex | null,
  ): DocumentIndexingStatusFacts {
    const activeIndexStatus =
      activeIndex === null
        ? null
        : {
            id: activeIndex.id,
            status: activeIndex.status,
            readyAt: activeIndex.readyAt?.nativeDate ?? null,
          }
    const requestedTarget = this.toRequestedTargetFacts(source, knowledgeBaseDocument)

    return { activeIndex: activeIndexStatus, requestedTarget }
  }

  static toDocumentIndexingStatus(
    jobStatusFacts: DocumentIndexingStatusFacts,
    requestedTargetState: DocumentIndexingTargetStateEnum | null,
  ): DocumentIndexingStatusDTO {
    const activeIndex = this.toActiveDocumentIndexStatus(jobStatusFacts.activeIndex)
    const requestedTarget = this.toRequestedIndexingTargetStatus(jobStatusFacts.requestedTarget, requestedTargetState)

    return { activeIndex, requestedTarget }
  }

  private static toRequestedTargetFacts(
    source: DocumentIndexingStatusSourceDTO,
    knowledgeBaseDocument: KnowledgeBaseDocument | null,
  ): RequestedTarget {
    const targetStateFacts = {
      requestedGeneration: knowledgeBaseDocument?.requestedGeneration ?? null,
      targetGeneration: source.generation,
      activeJobStatus: source.activeJobStatus,
      hasSuccessfulReceipt: source.hasSuccessfulReceipt,
      hasFailedJob: source.failedJobId !== null,
    }

    return {
      indexId: source.indexId,
      generation: source.generation,
      targetStateFacts,
      jobId: source.jobId,
      failedJobId: source.failedJobId,
      attempts: source.attempts,
      errorCode: source.errorCode,
      errorMessage: source.errorMessage,
      executionVerification: source.executionVerification,
    }
  }

  private static restoreDocumentIndexExecutionVerification(
    storedExecutionVerification: Record<string, unknown> | null,
  ): DocumentIndexExecutionVerificationDTO | null {
    if (storedExecutionVerification === null) return null

    const stage = storedExecutionVerification.stage
    const completedUnits = storedExecutionVerification.completedUnits
    const totalUnits = storedExecutionVerification.totalUnits
    const verifiedAt = storedExecutionVerification.verifiedAt

    if (
      typeof stage !== 'string' ||
      !Object.values(DocumentIndexExecutionStageEnum).includes(stage as DocumentIndexExecutionStageEnum) ||
      typeof completedUnits !== 'number' ||
      !(typeof totalUnits === 'number' || totalUnits === null) ||
      !(typeof verifiedAt === 'string' || verifiedAt === null)
    )
      return null

    const claimToken = storedExecutionVerification.claim_token
    const leaseExpiresAt = storedExecutionVerification.lease_expires_at

    return {
      stage: stage as DocumentIndexExecutionStageEnum,
      completedUnits,
      totalUnits,
      verifiedAt,
      ...(typeof claimToken === 'string' ? { claimToken } : {}),
      ...(typeof leaseExpiresAt === 'string' ? { leaseExpiresAt } : {}),
    }
  }

  private static toActiveDocumentIndexStatus(
    activeDocumentIndex: DocumentIndexingStatusFacts['activeIndex'],
  ): DocumentIndexingStatusDTO['activeIndex'] {
    if (activeDocumentIndex === null) return null

    return { id: activeDocumentIndex.id, status: activeDocumentIndex.status, readyAt: activeDocumentIndex.readyAt }
  }

  private static toRequestedIndexingTargetStatus(
    requestedJobTarget: RequestedTarget | null,
    requestedTargetState: DocumentIndexingTargetStateEnum | null,
  ): DocumentIndexingStatusDTO['requestedTarget'] {
    if (requestedJobTarget === null || requestedTargetState === null) return null

    const executionVerification = this.toDocumentIndexExecutionVerification(requestedJobTarget.executionVerification)

    return {
      indexId: requestedJobTarget.indexId,
      generation: requestedJobTarget.generation,
      state: requestedTargetState,
      jobId: requestedJobTarget.jobId,
      failedJobId: requestedJobTarget.failedJobId,
      attempts: requestedJobTarget.attempts,
      errorCode: requestedJobTarget.errorCode,
      errorMessage: requestedJobTarget.errorMessage,
      executionVerification,
    }
  }

  private static toDocumentIndexExecutionVerification(
    executionVerification: DocumentIndexExecutionVerificationDTO | null,
  ): DocumentIndexExecutionVerificationDTO | null {
    if (executionVerification === null) return null

    return {
      stage: executionVerification.stage,
      completedUnits: executionVerification.completedUnits,
      totalUnits: executionVerification.totalUnits,
      verifiedAt: executionVerification.verifiedAt,
      ...(executionVerification.claimToken !== undefined ? { claimToken: executionVerification.claimToken } : {}),
      ...(executionVerification.leaseExpiresAt !== undefined
        ? { leaseExpiresAt: executionVerification.leaseExpiresAt }
        : {}),
    }
  }
}
