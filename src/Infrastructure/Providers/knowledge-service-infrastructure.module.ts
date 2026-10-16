import { Module } from '@nestjs/common'

import { ChunkPlanningModule } from './chunk-planning.module.ts'
import { ChunkReplacementModule } from './chunk-replacement.module.ts'
import { ChunksModule } from './chunks.module.ts'
import { DocumentGarbageCollectionModule } from './document-garbage-collection.module.ts'
import { DocumentIndexProcessingModule } from './document-index-processing.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentIndexingModule } from './document-indexing.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { EmbeddingModule } from './embedding.module.ts'
import { KnowledgeBaseRetrievalModule } from './knowledge-base-retrieval.module.ts'
import { KnowledgeBasesModule } from './knowledge-bases.module.ts'
import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import { MembershipPruningModule } from './membership-pruning.module.ts'
import { MembershipsModule } from './memberships.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { ServiceAuthenticationModule } from './service-authentication.module.ts'

@Module({
  imports: [
    KnowledgeServiceConfigModule,
    ServiceAuthenticationModule,
    PersistenceModule,
    KnowledgeBasesModule,
    DocumentsModule,
    DocumentRevisionsModule,
    DocumentIndexesModule,
    MembershipsModule,
    ChunksModule,
    DocumentRelationsModule,
    EmbeddingModule,
    ChunkPlanningModule,
    ChunkReplacementModule,
    DocumentIndexingModule,
    DocumentIndexProcessingModule,
    DocumentGarbageCollectionModule,
    KnowledgeBaseRetrievalModule,
    MembershipPruningModule,
  ],
  exports: [
    KnowledgeServiceConfigModule,
    ServiceAuthenticationModule,
    PersistenceModule,
    KnowledgeBasesModule,
    DocumentsModule,
    DocumentRevisionsModule,
    DocumentIndexesModule,
    MembershipsModule,
    ChunksModule,
    DocumentRelationsModule,
    EmbeddingModule,
    ChunkPlanningModule,
    ChunkReplacementModule,
    DocumentIndexingModule,
    DocumentIndexProcessingModule,
    DocumentGarbageCollectionModule,
    KnowledgeBaseRetrievalModule,
    MembershipPruningModule,
  ],
})
export class KnowledgeServiceInfrastructureModule {}
