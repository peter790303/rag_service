import 'reflect-metadata'
import { DataSource } from 'typeorm'

import { loadKnowledgeDatabaseConfig } from '../../../../config/knowledge-service.config.ts'
import { CreateChunks1729000000006 } from '../../../Chunks/Infrastructure/Persistence/TypeORM/Migrations/1729000000006-create-chunks.ts'
import { ChunkModel } from '../../../Chunks/Infrastructure/Persistence/TypeORM/Models/chunk.model.ts'
import { CreateDocumentIndexes1729000000004 } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Migrations/1729000000004-create-document-indexes.ts'
import { CreateJobs1729000000008 } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Migrations/1729000000008-create-jobs.ts'
import { CreateFailedJobs1729000000009 } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Migrations/1729000000009-create-failed-jobs.ts'
import { CreateDocumentIndexSuccessReceipts1729000000014 } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Migrations/1729000000014-create-document-index-success-receipts.ts'
import { DocumentIndexSuccessReceiptModel } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/document-index-success-receipt.model.ts'
import { DocumentIndexModel } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/document-index.model.ts'
import { FailedJobModel } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/failed-job.model.ts'
import { JobModel } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/job.model.ts'
import { CreateDocumentRelations1729000000007 } from '../../../DocumentRelations/Infrastructure/Persistence/TypeORM/Migrations/1729000000007-create-document-relations.ts'
import { DocumentRelationModel } from '../../../DocumentRelations/Infrastructure/Persistence/TypeORM/Models/document-relation.model.ts'
import { CreateDocumentRevisions1729000000003 } from '../../../DocumentRevisions/Infrastructure/Persistence/TypeORM/Migrations/1729000000003-create-document-revisions.ts'
import { DocumentRevisionModel } from '../../../DocumentRevisions/Infrastructure/Persistence/TypeORM/Models/document-revision.model.ts'
import { CreateDocuments1729000000002 } from '../../../Documents/Infrastructure/Persistence/TypeORM/Migrations/1729000000002-create-documents.ts'
import { DocumentModel } from '../../../Documents/Infrastructure/Persistence/TypeORM/Models/document.model.ts'
import { CreateKnowledgeBaseDocuments1729000000005 } from '../../../KnowledgeBaseDocuments/Infrastructure/Persistence/TypeORM/Migrations/1729000000005-create-knowledge-base-documents.ts'
import { KnowledgeBaseDocumentModel } from '../../../KnowledgeBaseDocuments/Infrastructure/Persistence/TypeORM/Models/knowledge-base-document.model.ts'
import { CreateKnowledgeBases1729000000001 } from '../../../KnowledgeBases/Infrastructure/Persistence/TypeORM/Migrations/1729000000001-create-knowledge-bases.ts'
import { KnowledgeBaseModel } from '../../../KnowledgeBases/Infrastructure/Persistence/TypeORM/Models/knowledge-base.model.ts'
import { EnableVectorExtension1729000000000 } from '../../../Shared/Infrastructure/Persistence/TypeORM/Migrations/1729000000000-enable-vector-extension.ts'

const entities = [
  KnowledgeBaseModel,
  KnowledgeBaseDocumentModel,
  DocumentModel,
  DocumentRevisionModel,
  DocumentIndexModel,
  DocumentIndexSuccessReceiptModel,
  ChunkModel,
  DocumentRelationModel,
  JobModel,
  FailedJobModel,
]

export const createDataSource = (schema?: string): DataSource => {
  const activeConfig = loadKnowledgeDatabaseConfig()

  return new DataSource({
    type: 'postgres',
    url: activeConfig.databaseUrl,
    schema: schema ?? activeConfig.databaseSchema,
    entities,
    migrations: [
      EnableVectorExtension1729000000000,
      CreateKnowledgeBases1729000000001,
      CreateDocuments1729000000002,
      CreateDocumentRevisions1729000000003,
      CreateDocumentIndexes1729000000004,
      CreateKnowledgeBaseDocuments1729000000005,
      CreateChunks1729000000006,
      CreateDocumentRelations1729000000007,
      CreateJobs1729000000008,
      CreateFailedJobs1729000000009,
      CreateDocumentIndexSuccessReceipts1729000000014,
    ],
    synchronize: false,
  })
}

export default createDataSource()
