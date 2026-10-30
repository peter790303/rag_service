import { Module } from '@nestjs/common'

import { documentGarbageCollectionProviders } from './document-garbage-collection.providers.ts'
import { DocumentIndexRetentionModule } from './document-index-retention.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { DocumentRetentionModule } from './document-retention.module.ts'
import { DocumentRevisionRetentionModule } from './document-revision-retention.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { DocumentGarbageCollectionRequestedListener } from '../../../Documents/Application/Listeners/document-garbage-collection-requested.listener.ts'

@Module({
  imports: [
    PersistenceModule,
    DocumentsModule,
    DocumentIndexesModule,
    DocumentIndexRetentionModule,
    DocumentRevisionsModule,
    DocumentRevisionRetentionModule,
    DocumentRelationsModule,
    DocumentRetentionModule,
    KnowledgeServiceConfigModule,
  ],
  providers: documentGarbageCollectionProviders,
  exports: [DocumentGarbageCollectionRequestedListener],
})
export class DocumentGarbageCollectionModule {}
