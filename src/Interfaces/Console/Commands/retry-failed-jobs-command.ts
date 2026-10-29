import type { RetryUnretriedDocumentIndexFailuresResultDTO } from '../../../Application/DocumentIndexes/DataTransferObjects/retry-unretried-document-index-failures-result.dto.ts'
import { RetryDocumentIndexingListener } from '../../../Application/DocumentIndexes/Listeners/retry-document-indexing.listener.ts'
import type { UnretriedDocumentIndexFailuresQueryObject } from '../../../Application/DocumentIndexes/QueryObjects/document-index-failure.query-object.ts'

type RetryFailedJobsCommandOptions = Omit<UnretriedDocumentIndexFailuresQueryObject, 'cutoff'>

export class RetryFailedJobsCommand {
  constructor(private readonly retry: RetryDocumentIndexingListener) {}

  execute(options: RetryFailedJobsCommandOptions): Promise<RetryUnretriedDocumentIndexFailuresResultDTO> {
    return this.retry.retryUnretriedFailures({ ...options, cutoff: new Date() })
  }
}
