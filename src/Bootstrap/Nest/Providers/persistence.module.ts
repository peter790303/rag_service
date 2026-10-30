import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import {
  RETRIEVAL_READONLY_DATA_SOURCE,
  createRetrievalReadonlyDataSourceOptions,
} from './retrieval-readonly-data-source.options.ts'
import { KNOWLEDGE_SERVICE_CONFIG, type KnowledgeServiceConfig } from '../../../../config/knowledge-service.config.ts'
import { ChunkModel } from '../../../Chunks/Infrastructure/Persistence/TypeORM/Models/chunk.model.ts'
import { DocumentIndexSuccessReceiptModel } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/document-index-success-receipt.model.ts'
import { DocumentIndexModel } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/document-index.model.ts'
import { FailedJobModel } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/failed-job.model.ts'
import { JobModel } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/job.model.ts'
import { DocumentRelationModel } from '../../../DocumentRelations/Infrastructure/Persistence/TypeORM/Models/document-relation.model.ts'
import { DocumentRevisionModel } from '../../../DocumentRevisions/Infrastructure/Persistence/TypeORM/Models/document-revision.model.ts'
import { DocumentModel } from '../../../Documents/Infrastructure/Persistence/TypeORM/Models/document.model.ts'
import { KnowledgeBaseDocumentModel } from '../../../KnowledgeBaseDocuments/Infrastructure/Persistence/TypeORM/Models/knowledge-base-document.model.ts'
import { KnowledgeBaseModel } from '../../../KnowledgeBases/Infrastructure/Persistence/TypeORM/Models/knowledge-base.model.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'
import { PersistenceTransaction } from '../../../Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'

const knowledgePersistenceModels = [
  KnowledgeBaseModel,
  KnowledgeBaseDocumentModel,
  DocumentModel,
  DocumentRevisionModel,
  DocumentIndexModel,
  ChunkModel,
  DocumentRelationModel,
  JobModel,
  FailedJobModel,
  DocumentIndexSuccessReceiptModel,
]

@Module({
  imports: [
    KnowledgeServiceConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [KnowledgeServiceConfigModule],
      inject: [KNOWLEDGE_SERVICE_CONFIG],
      useFactory: (serviceConfig: KnowledgeServiceConfig) => ({
        type: 'postgres' as const,
        url: serviceConfig.databaseUrl,
        schema: serviceConfig.databaseSchema,
        entities: knowledgePersistenceModels,
        synchronize: false,
        migrationsRun: false,
      }),
    }),
    TypeOrmModule.forRootAsync({
      name: RETRIEVAL_READONLY_DATA_SOURCE,
      imports: [KnowledgeServiceConfigModule],
      inject: [KNOWLEDGE_SERVICE_CONFIG],
      useFactory: (serviceConfig: KnowledgeServiceConfig) =>
        createRetrievalReadonlyDataSourceOptions({
          url: serviceConfig.databaseUrl,
          schema: serviceConfig.databaseSchema,
          entities: knowledgePersistenceModels,
        }),
    }),
  ],
  providers: [PersistenceTransaction, { provide: PersistenceTransactionContract, useExisting: PersistenceTransaction }],
  exports: [PersistenceTransaction, PersistenceTransactionContract],
})
export class PersistenceModule {}
