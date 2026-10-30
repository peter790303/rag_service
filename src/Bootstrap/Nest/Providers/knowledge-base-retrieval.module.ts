import { Module } from '@nestjs/common'

import { ChunksModule } from './chunks.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { EmbeddingModule } from './embedding.module.ts'
import { IndexingProfilesModule } from './indexing-profiles.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { KnowledgeBasesModule } from './knowledge-bases.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { RetrieveKnowledgeBaseContentQueryHandler } from '../../../KnowledgeBases/Application/Queries/retrieve-knowledge-base-content.query.handler.ts'
import { knowledgeBaseRetrievalProviders } from '../../../KnowledgeBases/Infrastructure/Nest/Providers/knowledge-base-retrieval.providers.ts'

@Module({
  imports: [
    PersistenceModule,
    KnowledgeBasesModule,
    KnowledgeBaseDocumentsModule,
    DocumentsModule,
    DocumentIndexesModule,
    DocumentRevisionsModule,
    ChunksModule,
    DocumentRelationsModule,
    EmbeddingModule,
    IndexingProfilesModule,
  ],
  providers: knowledgeBaseRetrievalProviders,
  exports: [RetrieveKnowledgeBaseContentQueryHandler],
})
export class KnowledgeBaseRetrievalModule {}
