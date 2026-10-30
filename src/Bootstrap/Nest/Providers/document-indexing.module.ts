import { Module } from '@nestjs/common'

import { DocumentIndexRetentionModule } from './document-index-retention.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { EmbeddingModule } from './embedding.module.ts'
import { IndexingProfilesModule } from './indexing-profiles.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { KnowledgeBasesModule } from './knowledge-bases.module.ts'
import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { AuthorizeDocumentIndexChunkReplacementCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/authorize-document-index-chunk-replacement.command.handler.contract.ts'
import { DispatchDocumentIndexingListener } from '../../../DocumentIndexes/Application/Listeners/dispatch-document-indexing.listener.ts'
import { DocumentIndexedListener } from '../../../DocumentIndexes/Application/Listeners/document-indexed.listener.ts'
import { DocumentIndexingFailedListener } from '../../../DocumentIndexes/Application/Listeners/document-indexing-failed.listener.ts'
import { DocumentIndexingRequestedListener } from '../../../DocumentIndexes/Application/Listeners/document-indexing-requested.listener.ts'
import { ReadDocumentIndexingStatusListener } from '../../../DocumentIndexes/Application/Listeners/read-document-indexing-status.listener.ts'
import { RetryDocumentIndexingListener } from '../../../DocumentIndexes/Application/Listeners/retry-document-indexing.listener.ts'
import { documentIndexingProviders } from '../../../DocumentIndexes/Infrastructure/Nest/Providers/document-indexing.providers.ts'

@Module({
  imports: [
    PersistenceModule,
    DocumentsModule,
    KnowledgeBaseDocumentsModule,
    DocumentIndexesModule,
    DocumentIndexRetentionModule,
    KnowledgeServiceConfigModule,
    KnowledgeBasesModule,
    DocumentRevisionsModule,
    IndexingProfilesModule,
    EmbeddingModule,
  ],
  providers: documentIndexingProviders,
  exports: [
    AuthorizeDocumentIndexChunkReplacementCommandHandlerContract,
    DocumentIndexedListener,
    DocumentIndexingFailedListener,
    DispatchDocumentIndexingListener,
    ReadDocumentIndexingStatusListener,
    DocumentIndexingRequestedListener,
    RetryDocumentIndexingListener,
  ],
})
export class DocumentIndexingModule {}
