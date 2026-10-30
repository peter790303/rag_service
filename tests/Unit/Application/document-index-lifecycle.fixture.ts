import type { DocumentIndexExecutionRecordDTO } from '../../../src/DocumentIndexes/Application/DataTransferObjects/document-index-execution-record.dto.ts'
import type { DocumentIndexRecordDTO } from '../../../src/DocumentIndexes/Application/DataTransferObjects/document-index-record.dto.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/DocumentIndexes/Application/Helpers/document-index-execution-lifecycle.helper.ts'
import { DocumentIndex, type DocumentIndexState } from '../../../src/DocumentIndexes/Domain/Entities/document-index.ts'
import { DocumentIndexStatusEnum } from '../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import type { DocumentRecordDTO } from '../../../src/Documents/Application/DataTransferObjects/document-record.dto.ts'
import { Document, type DocumentState } from '../../../src/Documents/Domain/Entities/document.ts'
import {
  KnowledgeBaseDocument,
  type KnowledgeBaseDocumentState,
} from '../../../src/KnowledgeBaseDocuments/Domain/Entities/knowledge-base-document.ts'

const lifecycleFixtureCreatedAt = new Date('2020-01-01T00:00:00.000Z')

export const createRepositoryStub = <T>(methods: Partial<T>): T => methods as T

export const createDocumentRecordFixture = (overrides: Partial<DocumentRecordDTO> = {}): DocumentRecordDTO => ({
  id: 'document',
  sourceType: 'repository',
  sourceKey: 'document.md',
  sourcePath: 'document.md',
  currentTitle: null,
  unreferencedSince: null,
  createdAt: lifecycleFixtureCreatedAt,
  ...overrides,
})

export const createKnowledgeBaseDocumentRecordFixture = (
  overrides: Partial<KnowledgeBaseDocumentState> = {},
): KnowledgeBaseDocumentState => ({
  knowledgeBaseId: 'kb',
  documentId: 'document',
  activeDocumentIndexId: null,
  requestedGeneration: '1',
  isEntry: false,
  alwaysIncludeFullContent: false,
  updatedAt: lifecycleFixtureCreatedAt,
  ...overrides,
})

export const createDocumentFixture = (documentOverrides: Partial<DocumentState> = {}): Document =>
  new Document({ ...createDocumentRecordFixture(), ...documentOverrides })

export const createRestoredKnowledgeBaseDocumentFixture = (
  knowledgeBaseDocumentOverrides: Partial<KnowledgeBaseDocumentState> = {},
): KnowledgeBaseDocument =>
  new KnowledgeBaseDocument(createKnowledgeBaseDocumentRecordFixture(knowledgeBaseDocumentOverrides))

export const createDocumentIndexRecordFixture = (
  overrides: Partial<DocumentIndexRecordDTO> = {},
): DocumentIndexRecordDTO => ({
  id: 'index',
  documentId: 'document',
  revisionId: 'revision',
  pipelineHash: 'pipeline',
  chunkingModel: 'planner',
  chunkingProfile: 'chunking-v1',
  embeddingModel: 'embedding',
  embeddingDimensions: 2,
  embeddingProfile: 'embedding-v1',
  lexicalProfile: 'lexical-v1',
  relationProfile: 'relation-v1',
  status: DocumentIndexStatusEnum.BUILDING,
  createdAt: lifecycleFixtureCreatedAt,
  readyAt: null,
  unreferencedSince: null,
  ...overrides,
})

export const createRestoredDocumentIndexFixture = (
  documentIndexOverrides: Partial<DocumentIndexState> = {},
): DocumentIndex => new DocumentIndex({ ...createDocumentIndexRecordFixture(), ...documentIndexOverrides })

export const createJobRecordFixture = (
  overrides: Partial<DocumentIndexExecutionRecordDTO> = {},
): DocumentIndexExecutionRecordDTO => {
  const record: DocumentIndexExecutionRecordDTO = {
    id: 'job',
    knowledgeBaseId: 'kb',
    documentId: 'document',
    documentIndexId: 'index',
    generation: '1',
    status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
    attempts: 1,
    availableAt: lifecycleFixtureCreatedAt,
    reservedAt: lifecycleFixtureCreatedAt,
    leaseToken: 'lease',
    leaseExpiresAt: new Date('2100-01-01T00:00:00.000Z'),
    idempotencyKey: null,
    retryOfFailedJobId: null,
    payload: {},
    executionState: null,
    executionVerification: null,
    createdAt: lifecycleFixtureCreatedAt,
    updatedAt: lifecycleFixtureCreatedAt,
    ...overrides,
  }
  record.executionVerification = {
    ...record.executionVerification,
    claim_token: record.leaseToken,
    lease_expires_at: record.leaseExpiresAt?.toISOString() ?? null,
  }

  return record
}
