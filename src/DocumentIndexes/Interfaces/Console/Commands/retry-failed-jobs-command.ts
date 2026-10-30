import type { RetryUnretriedDocumentIndexFailuresResultDTO } from '../../../Application/DTOs/retry-unretried-document-index-failures-result.dto.ts'
import { RetryDocumentIndexingListener } from '../../../Application/Listeners/retry-document-indexing.listener.ts'
import type { UnretriedDocumentIndexFailuresParams } from '../../../Application/Ports/Out/Gateways/document-index-failure.params.ts'

type RetryFailedJobsCommandOptions = Omit<UnretriedDocumentIndexFailuresParams, 'cutoff'>

export class RetryFailedJobsCommand {
  constructor(private readonly retry: RetryDocumentIndexingListener) {}

  execute(options: RetryFailedJobsCommandOptions): Promise<RetryUnretriedDocumentIndexFailuresResultDTO> {
    return this.retry.retryUnretriedFailures({ ...options, cutoff: new Date() })
  }
}
