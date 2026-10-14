import 'reflect-metadata'
import { DataSource } from 'typeorm'

import { EnableVectorExtension1729000000000 } from './migrations/1729000000000-enable-vector-extension.js'
import { CreateKnowledgeBases1729000000001 } from './migrations/1729000000001-create-knowledge-bases.js'
import { CreateDocuments1729000000002 } from './migrations/1729000000002-create-documents.js'
import { CreateDocumentRevisions1729000000003 } from './migrations/1729000000003-create-document-revisions.js'
import { CreateDocumentIndexes1729000000004 } from './migrations/1729000000004-create-document-indexes.js'
import { CreateKnowledgeBaseDocuments1729000000005 } from './migrations/1729000000005-create-knowledge-base-documents.js'
import { CreateChunks1729000000006 } from './migrations/1729000000006-create-chunks.js'
import { CreateDocumentRelations1729000000007 } from './migrations/1729000000007-create-document-relations.js'
import { CreateJobs1729000000008 } from './migrations/1729000000008-create-jobs.js'
import { CreateFailedJobs1729000000009 } from './migrations/1729000000009-create-failed-jobs.js'
import { loadRagDatabaseConfig } from '../config/rag.config.js'
import { RagChunkModel } from '../src/Infrastructure/Persistence/Models/rag-chunk.model.js'
import { RagDocumentIndexModel } from '../src/Infrastructure/Persistence/Models/rag-document-index.model.js'
import { RagDocumentRelationModel } from '../src/Infrastructure/Persistence/Models/rag-document-relation.model.js'
import { RagDocumentRevisionModel } from '../src/Infrastructure/Persistence/Models/rag-document-revision.model.js'
import { RagDocumentModel } from '../src/Infrastructure/Persistence/Models/rag-document.model.js'
import { RagFailedJobModel } from '../src/Infrastructure/Persistence/Models/rag-failed-job.model.js'
import { RagJobModel } from '../src/Infrastructure/Persistence/Models/rag-job.model.js'
import { RagKnowledgeBaseModel } from '../src/Infrastructure/Persistence/Models/rag-knowledge-base.model.js'
import { RagMembershipModel } from '../src/Infrastructure/Persistence/Models/rag-membership.model.js'

const entities = [
  RagKnowledgeBaseModel,
  RagMembershipModel,
  RagDocumentModel,
  RagDocumentRevisionModel,
  RagDocumentIndexModel,
  RagChunkModel,
  RagDocumentRelationModel,
  RagJobModel,
  RagFailedJobModel,
]

export const createDataSource = (schema?: string): DataSource => {
  const activeConfig = loadRagDatabaseConfig()

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
    ],
    synchronize: false,
  })
}

export default createDataSource()
