import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { Membership } from '../../../Domain/Membership/membership.ts'
import type { DocumentIndexExecutionRecordDto } from '../DataTransferObjects/document-index-execution-record.dto.ts'
import type { DocumentIndexExecutionVerificationDto } from '../DataTransferObjects/document-index-execution-verification.dto.ts'
import type { DocumentIndexFailureRecordDto } from '../DataTransferObjects/document-index-failure-record.dto.ts'
import type { DocumentIndexingStatusFacts } from '../DataTransferObjects/document-indexing-status-facts.dto.ts'
import type { DocumentIndexingStatusSourceDto } from '../DataTransferObjects/document-indexing-status-source.dto.ts'
import type { DocumentIndexingStatusDto } from '../DataTransferObjects/document-indexing-status.dto.ts'
import { DocumentIndexExecutionStageEnum } from '../Enums/document-index-execution-stage.enum.ts'
import { DocumentIndexingTargetStateEnum } from '../Enums/document-indexing-target-state.enum.ts'

type RequestedTarget = NonNullable<DocumentIndexingStatusFacts['requestedTarget']>

/** Projects status facts after the use case has chosen the target state. */
export class ReadStatusDocumentIndexesAssembler {
  static toActiveIndexingStatusSource(activeJob: DocumentIndexExecutionRecordDto): DocumentIndexingStatusSourceDto {
    return {
      knowledgeBaseId: activeJob.knowledgeBaseId,
      documentId: activeJob.documentId,
      indexId: activeJob.documentIndexId,
      generation: activeJob.generation,
      activeJobStatus: activeJob.status,
      jobId: activeJob.id,
      failedJobId: null,
      attempts: activeJob.attempts,
      errorCode: null,
      errorMessage: null,
      executionVerification: this.restoreDocumentIndexExecutionVerification(activeJob.executionVerification),
    }
  }

  static toFailedIndexingStatusSource(failedJob: DocumentIndexFailureRecordDto): DocumentIndexingStatusSourceDto {
    return {
      knowledgeBaseId: failedJob.knowledgeBaseId,
      documentId: failedJob.documentId,
      indexId: failedJob.documentIndexId,
      generation: failedJob.generation,
      activeJobStatus: null,
      jobId: null,
      failedJobId: failedJob.id,
      attempts: failedJob.attempts,
      errorCode: failedJob.errorCode,
      errorMessage: failedJob.errorMessage,
      executionVerification: null,
    }
  }

  static toDocumentIndexingStatusFacts(
    source: DocumentIndexingStatusSourceDto,
    membership: Membership | null,
    activeIndex: DocumentIndex | null,
    targetIndex: DocumentIndex | null,
  ): DocumentIndexingStatusFacts {
    const activeIndexStatus =
      activeIndex === null
        ? null
        : {
            id: activeIndex.id,
            status: activeIndex.status,
            readyAt: activeIndex.readyAt?.nativeDate ?? null,
          }
    const requestedTarget = this.toRequestedTargetFacts(source, membership, targetIndex)

    return { activeIndex: activeIndexStatus, requestedTarget }
  }

  static toDocumentIndexingStatus(
    jobStatusFacts: DocumentIndexingStatusFacts,
    requestedTargetState: DocumentIndexingTargetStateEnum | null,
  ): DocumentIndexingStatusDto {
    const activeIndex = this.toActiveDocumentIndexStatus(jobStatusFacts.activeIndex)
    const requestedTarget = this.toRequestedIndexingTargetStatus(jobStatusFacts.requestedTarget, requestedTargetState)

    return { activeIndex, requestedTarget }
  }

  private static toRequestedTargetFacts(
    source: DocumentIndexingStatusSourceDto,
    membership: Membership | null,
    targetIndex: DocumentIndex | null,
  ): RequestedTarget {
    const targetStateFacts = {
      requestedGeneration: membership?.requestedGeneration ?? null,
      targetGeneration: source.generation,
      activeJobStatus: source.activeJobStatus,
      hasFailedJob: source.failedJobId !== null,
      targetIndexStatus: targetIndex?.status ?? null,
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
  ): DocumentIndexExecutionVerificationDto | null {
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
  ): DocumentIndexingStatusDto['activeIndex'] {
    if (activeDocumentIndex === null) return null

    return { id: activeDocumentIndex.id, status: activeDocumentIndex.status, readyAt: activeDocumentIndex.readyAt }
  }

  private static toRequestedIndexingTargetStatus(
    requestedJobTarget: RequestedTarget | null,
    requestedTargetState: DocumentIndexingTargetStateEnum | null,
  ): DocumentIndexingStatusDto['requestedTarget'] {
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
    executionVerification: DocumentIndexExecutionVerificationDto | null,
  ): DocumentIndexExecutionVerificationDto | null {
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
