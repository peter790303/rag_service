import type { DocumentIndexExecutionVerificationDTO } from '../../../Application/DocumentIndexes/DataTransferObjects/document-index-execution-verification.dto.ts'
import type { DocumentIndexingStatusDTO } from '../../../Application/DocumentIndexes/DataTransferObjects/document-indexing-status.dto.ts'

export class DocumentIndexingStatusResource {
  static toDocumentIndexingStatusResource(jobStatus: DocumentIndexingStatusDTO): DocumentIndexingStatusDTO {
    const activeIndex = DocumentIndexingStatusResource.toActiveDocumentIndexResource(jobStatus.activeIndex)
    const requestedTarget = DocumentIndexingStatusResource.toRequestedDocumentIndexTargetResource(
      jobStatus.requestedTarget,
    )

    return { activeIndex, requestedTarget }
  }

  private static toActiveDocumentIndexResource(
    activeIndex: DocumentIndexingStatusDTO['activeIndex'],
  ): DocumentIndexingStatusDTO['activeIndex'] {
    if (activeIndex === null) return null

    return {
      id: activeIndex.id,
      status: activeIndex.status,
      readyAt: activeIndex.readyAt,
    }
  }

  private static toRequestedDocumentIndexTargetResource(
    requestedTarget: DocumentIndexingStatusDTO['requestedTarget'],
  ): DocumentIndexingStatusDTO['requestedTarget'] {
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
