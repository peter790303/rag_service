import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import {
  RETRIEVAL_READONLY_DATA_SOURCE,
  createRetrievalReadonlyDataSourceOptions,
} from './retrieval-readonly-data-source.options.ts'
import { KNOWLEDGE_SERVICE_CONFIG, type KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../Application/KnowledgeBases/Contracts/persistence-transaction.ts'
import { ChunkModel } from '../Persistence/Models/chunk.model.ts'
import { DocumentIndexSuccessReceiptModel } from '../Persistence/Models/document-index-success-receipt.model.ts'
import { DocumentIndexModel } from '../Persistence/Models/document-index.model.ts'
import { DocumentRelationModel } from '../Persistence/Models/document-relation.model.ts'
import { DocumentRevisionModel } from '../Persistence/Models/document-revision.model.ts'
import { DocumentModel } from '../Persistence/Models/document.model.ts'
import { FailedJobModel } from '../Persistence/Models/failed-job.model.ts'
import { JobModel } from '../Persistence/Models/job.model.ts'
import { KnowledgeBaseDocumentModel } from '../Persistence/Models/knowledge-base-document.model.ts'
import { KnowledgeBaseModel } from '../Persistence/Models/knowledge-base.model.ts'
import { PersistenceTransaction } from '../Persistence/persistence-transaction.ts'

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
