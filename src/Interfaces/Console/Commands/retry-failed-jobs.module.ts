import { Module } from '@nestjs/common'

import { RetryFailedJobsCommand } from './retry-failed-jobs-command.ts'
import { RetryDocumentIndexingListener } from '../../../Application/DocumentIndexes/Listeners/retry-document-indexing.listener.ts'
import { DocumentIndexingModule } from '../../../Infrastructure/Providers/document-indexing.module.ts'

@Module({
  imports: [DocumentIndexingModule],
  providers: [
    {
      provide: RetryFailedJobsCommand,
      useFactory: (retry: RetryDocumentIndexingListener) => new RetryFailedJobsCommand(retry),
      inject: [RetryDocumentIndexingListener],
    },
  ],
  exports: [RetryFailedJobsCommand],
})
export class RetryFailedJobsModule {}
