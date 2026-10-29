import { Module } from '@nestjs/common'

import { DocumentIndexImportCommand } from './document-index-import-command.ts'
import { DocumentIndexingRequestedListener } from '../../../Application/DocumentIndexes/Listeners/document-indexing-requested.listener.ts'
import { ReadDocumentIndexingStatusListener } from '../../../Application/DocumentIndexes/Listeners/read-document-indexing-status.listener.ts'
import { RetryDocumentIndexingListener } from '../../../Application/DocumentIndexes/Listeners/retry-document-indexing.listener.ts'
import { DocumentIndexingModule } from '../../../Infrastructure/Providers/document-indexing.module.ts'

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
