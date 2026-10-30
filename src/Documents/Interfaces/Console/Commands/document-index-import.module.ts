import { Module } from '@nestjs/common'

import { DocumentIndexImportCommand } from './document-index-import-command.ts'
import { DocumentIndexingModule } from '../../../../Bootstrap/Nest/Providers/document-indexing.module.ts'
import { DocumentIndexingRequestedListener } from '../../../../DocumentIndexes/Application/Listeners/document-indexing-requested.listener.ts'
import { ReadDocumentIndexingStatusListener } from '../../../../DocumentIndexes/Application/Listeners/read-document-indexing-status.listener.ts'
import { RetryDocumentIndexingListener } from '../../../../DocumentIndexes/Application/Listeners/retry-document-indexing.listener.ts'

@Module({
  imports: [DocumentIndexingModule],
  providers: [
    {
      provide: DocumentIndexImportCommand,
      useFactory: (
        requested: DocumentIndexingRequestedListener,
        readStatus: ReadDocumentIndexingStatusListener,
        retry: RetryDocumentIndexingListener,
      ) => new DocumentIndexImportCommand(requested, readStatus, retry),
      inject: [DocumentIndexingRequestedListener, ReadDocumentIndexingStatusListener, RetryDocumentIndexingListener],
    },
  ],
  exports: [DocumentIndexImportCommand],
})
export class DocumentIndexImportModule {}
