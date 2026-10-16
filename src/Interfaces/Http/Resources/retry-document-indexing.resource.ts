import type { RetryDocumentIndexingResultDto } from '../../../Application/DocumentIndexes/DataTransferObjects/retry-document-indexing-result.dto.ts'

export class RetryDocumentIndexingResource {
  static toRetryDocumentIndexingResource(
    failedJobRetry: RetryDocumentIndexingResultDto,
  ): RetryDocumentIndexingResultDto {
    return {
      jobId: failedJobRetry.jobId,
      failedJobId: failedJobRetry.failedJobId,
      status: failedJobRetry.status,
      retryOfFailedJobId: failedJobRetry.retryOfFailedJobId,
    }
  }
}
