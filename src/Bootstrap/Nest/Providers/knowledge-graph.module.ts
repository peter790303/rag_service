import { Module } from '@nestjs/common'

import { ChunksModule } from './chunks.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { KnowledgeBasesModule } from './knowledge-bases.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { ListKnowledgeGraphProjectsQueryHandler } from '../../../KnowledgeBases/Application/Queries/list-knowledge-graph-projects.query.handler.ts'
import { LoadKnowledgeGraphQueryHandler } from '../../../KnowledgeBases/Application/Queries/load-knowledge-graph.query.handler.ts'
import { knowledgeGraphProviders } from '../../../KnowledgeBases/Infrastructure/Nest/Providers/knowledge-graph.providers.ts'

@Module({
  imports: [
    PersistenceModule,
    KnowledgeBasesModule,
    KnowledgeBaseDocumentsModule,
    DocumentsModule,
    DocumentIndexesModule,
    DocumentRelationsModule,
    ChunksModule,
  ],
  providers: knowledgeGraphProviders,
  exports: [LoadKnowledgeGraphQueryHandler, ListKnowledgeGraphProjectsQueryHandler],
})
export class KnowledgeGraphModule {}
