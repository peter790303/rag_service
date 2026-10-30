import type { RetryDocumentIndexingResultDTO } from '../../../Application/DataTransferObjects/retry-document-indexing-result.dto.ts'

export class RetryDocumentIndexingResource {
  static toRetryDocumentIndexingResource(
    failedJobRetry: RetryDocumentIndexingResultDTO,
  ): RetryDocumentIndexingResultDTO {
    return {
      jobId: failedJobRetry.jobId,
      failedJobId: failedJobRetry.failedJobId,
      status: failedJobRetry.status,
      retryOfFailedJobId: failedJobRetry.retryOfFailedJobId,
    }
  }
}
