import 'reflect-metadata'
import { DataSource } from 'typeorm'

import { loadKnowledgeDatabaseConfig } from '../config/knowledge-service.config.ts'
import { EnableVectorExtension1729000000000 } from './migrations/1729000000000-enable-vector-extension.ts'
import { CreateKnowledgeBases1729000000001 } from './migrations/1729000000001-create-knowledge-bases.ts'
import { CreateDocuments1729000000002 } from './migrations/1729000000002-create-documents.ts'
import { CreateDocumentRevisions1729000000003 } from './migrations/1729000000003-create-document-revisions.ts'
import { CreateDocumentIndexes1729000000004 } from './migrations/1729000000004-create-document-indexes.ts'
import { CreateKnowledgeBaseDocuments1729000000005 } from './migrations/1729000000005-create-knowledge-base-documents.ts'
import { CreateChunks1729000000006 } from './migrations/1729000000006-create-chunks.ts'
import { CreateDocumentRelations1729000000007 } from './migrations/1729000000007-create-document-relations.ts'
import { CreateJobs1729000000008 } from './migrations/1729000000008-create-jobs.ts'
import { CreateFailedJobs1729000000009 } from './migrations/1729000000009-create-failed-jobs.ts'
import { AddJobLeaseExpiry1729000000010 } from './migrations/1729000000010-add-job-lease-expiry.ts'
import { ChunkModel } from '../src/Infrastructure/Persistence/Models/chunk.model.ts'
import { DocumentIndexModel } from '../src/Infrastructure/Persistence/Models/document-index.model.ts'
import { DocumentRelationModel } from '../src/Infrastructure/Persistence/Models/document-relation.model.ts'
import { DocumentRevisionModel } from '../src/Infrastructure/Persistence/Models/document-revision.model.ts'
import { DocumentModel } from '../src/Infrastructure/Persistence/Models/document.model.ts'
import { FailedJobModel } from '../src/Infrastructure/Persistence/Models/failed-job.model.ts'
import { JobModel } from '../src/Infrastructure/Persistence/Models/job.model.ts'
import { KnowledgeBaseDocumentMembershipModel } from '../src/Infrastructure/Persistence/Models/knowledge-base-document-membership.model.ts'
import { KnowledgeBaseModel } from '../src/Infrastructure/Persistence/Models/knowledge-base.model.ts'

const entities = [
  KnowledgeBaseModel,
  KnowledgeBaseDocumentMembershipModel,
  DocumentModel,
  DocumentRevisionModel,
  DocumentIndexModel,
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
      AddJobLeaseExpiry1729000000010,
    ],
    synchronize: false,
  })
}

export default createDataSource()
