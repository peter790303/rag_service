import type { DocumentIndexExecutionVerificationDto } from '../../../Application/DocumentIndexes/DataTransferObjects/document-index-execution-verification.dto.ts'
import type { DocumentIndexingStatusDto } from '../../../Application/DocumentIndexes/DataTransferObjects/document-indexing-status.dto.ts'

export class DocumentIndexingStatusResource {
  static toDocumentIndexingStatusResource(jobStatus: DocumentIndexingStatusDto): DocumentIndexingStatusDto {
    const activeIndex = DocumentIndexingStatusResource.toActiveDocumentIndexResource(jobStatus.activeIndex)
    const requestedTarget = DocumentIndexingStatusResource.toRequestedDocumentIndexTargetResource(
      jobStatus.requestedTarget,
    )

    return { activeIndex, requestedTarget }
  }

  private static toActiveDocumentIndexResource(
    activeIndex: DocumentIndexingStatusDto['activeIndex'],
  ): DocumentIndexingStatusDto['activeIndex'] {
    if (activeIndex === null) return null

    return {
      id: activeIndex.id,
      status: activeIndex.status,
      readyAt: activeIndex.readyAt,
    }
  }

  private static toRequestedDocumentIndexTargetResource(
    requestedTarget: DocumentIndexingStatusDto['requestedTarget'],
  ): DocumentIndexingStatusDto['requestedTarget'] {
    if (requestedTarget === null) return null

    const executionVerification = DocumentIndexingStatusResource.toDocumentIndexExecutionVerificationResource(
      requestedTarget.executionVerification,
    )

    return {
      indexId: requestedTarget.indexId,
      generation: requestedTarget.generation,
      state: requestedTarget.state,
      jobId: requestedTarget.jobId,
      failedJobId: requestedTarget.failedJobId,
      attempts: requestedTarget.attempts,
      errorCode: requestedTarget.errorCode,
      errorMessage: requestedTarget.errorMessage,
      executionVerification,
    }
  }

  private static toDocumentIndexExecutionVerificationResource(
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
