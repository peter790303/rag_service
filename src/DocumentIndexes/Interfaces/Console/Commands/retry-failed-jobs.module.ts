import { Module } from '@nestjs/common'

import { RetryFailedJobsCommand } from './retry-failed-jobs-command.ts'
import { DocumentIndexingModule } from '../../../../Bootstrap/Nest/Providers/document-indexing.module.ts'
import { RetryDocumentIndexingListener } from '../../../Application/Listeners/retry-document-indexing.listener.ts'

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
