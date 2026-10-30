import 'reflect-metadata'
import { DataSource } from 'typeorm'

import { EnableVectorExtension1729000000000 } from './Migrations/1729000000000-enable-vector-extension.ts'
import { CreateKnowledgeBases1729000000001 } from './Migrations/1729000000001-create-knowledge-bases.ts'
import { CreateDocuments1729000000002 } from './Migrations/1729000000002-create-documents.ts'
import { CreateDocumentRevisions1729000000003 } from './Migrations/1729000000003-create-document-revisions.ts'
import { CreateDocumentIndexes1729000000004 } from './Migrations/1729000000004-create-document-indexes.ts'
import { CreateKnowledgeBaseDocuments1729000000005 } from './Migrations/1729000000005-create-knowledge-base-documents.ts'
import { CreateChunks1729000000006 } from './Migrations/1729000000006-create-chunks.ts'
import { CreateDocumentRelations1729000000007 } from './Migrations/1729000000007-create-document-relations.ts'
import { CreateJobs1729000000008 } from './Migrations/1729000000008-create-jobs.ts'
import { CreateFailedJobs1729000000009 } from './Migrations/1729000000009-create-failed-jobs.ts'
import { CreateDocumentIndexSuccessReceipts1729000000014 } from './Migrations/1729000000014-create-document-index-success-receipts.ts'
import { loadKnowledgeDatabaseConfig } from '../../../../../config/knowledge-service.config.ts'
import { ChunkModel } from '../../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/chunk.model.ts'
import { DocumentIndexSuccessReceiptModel } from '../../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/document-index-success-receipt.model.ts'
import { DocumentIndexModel } from '../../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/document-index.model.ts'
import { FailedJobModel } from '../../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/failed-job.model.ts'
import { JobModel } from '../../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/job.model.ts'
import { DocumentRelationModel } from '../../../../Documents/Infrastructure/Persistence/TypeORM/Models/document-relation.model.ts'
import { DocumentRevisionModel } from '../../../../Documents/Infrastructure/Persistence/TypeORM/Models/document-revision.model.ts'
import { DocumentModel } from '../../../../Documents/Infrastructure/Persistence/TypeORM/Models/document.model.ts'
import { KnowledgeBaseDocumentModel } from '../../../../KnowledgeBases/Infrastructure/Persistence/TypeORM/Models/knowledge-base-document.model.ts'
import { KnowledgeBaseModel } from '../../../../KnowledgeBases/Infrastructure/Persistence/TypeORM/Models/knowledge-base.model.ts'

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
