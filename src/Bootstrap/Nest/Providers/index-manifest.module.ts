import { Module } from '@nestjs/common'

import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { KnowledgeBasesModule } from './knowledge-bases.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { indexManifestProviders } from '../../../DocumentIndexes/Infrastructure/Nest/Providers/index-manifest.providers.ts'
import { LoadIndexManifestQueryHandler } from '../../../KnowledgeBases/Application/Queries/load-index-manifest.query.handler.ts'

@Module({
  imports: [
    PersistenceModule,
    KnowledgeBasesModule,
    KnowledgeBaseDocumentsModule,
    DocumentsModule,
    DocumentIndexesModule,
    DocumentRevisionsModule,
  ],
  providers: indexManifestProviders,
  exports: [LoadIndexManifestQueryHandler],
})
export class IndexManifestModule {}
