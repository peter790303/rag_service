import { Module } from '@nestjs/common'

import { ChunkPlanningModule } from './chunk-planning.module.ts'
import { ChunkReplacementModule } from './chunk-replacement.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentIndexingModule } from './document-indexing.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { EmbeddingModule } from './embedding.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { ProcessDocumentIndexListener } from '../../../DocumentIndexes/Application/Listeners/process-document-index.listener.ts'
import { documentIndexProcessingProviders } from '../../../DocumentIndexes/Infrastructure/Nest/Providers/document-index-processing.providers.ts'

@Module({
  imports: [
    PersistenceModule,
    DocumentsModule,
    KnowledgeBaseDocumentsModule,
    DocumentIndexesModule,
    DocumentRevisionsModule,
    ChunkReplacementModule,
    DocumentIndexingModule,
    EmbeddingModule,
    ChunkPlanningModule,
    KnowledgeServiceConfigModule,
  ],
  providers: documentIndexProcessingProviders,
  exports: [ProcessDocumentIndexListener],
})
export class DocumentIndexProcessingModule {}
