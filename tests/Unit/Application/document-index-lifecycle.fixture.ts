import type { DocumentIndexExecutionRecordDto } from '../../../src/Application/DocumentIndexes/DataTransferObjects/document-index-execution-record.dto.ts'
import type { DocumentIndexRecordDto } from '../../../src/Application/DocumentIndexes/DataTransferObjects/document-index-record.dto.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/Application/DocumentIndexes/Helpers/document-index-execution-lifecycle.helper.ts'
import type { DocumentRecordDto } from '../../../src/Application/Documents/DataTransferObjects/document-record.dto.ts'
import { Document, type DocumentState } from '../../../src/Domain/Document/document.ts'
import { DocumentIndex, type DocumentIndexState } from '../../../src/Domain/DocumentIndex/document-index.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { Membership, type MembershipState } from '../../../src/Domain/Membership/membership.ts'

const lifecycleFixtureCreatedAt = new Date('2020-01-01T00:00:00.000Z')

export const createRepositoryStub = <T>(methods: Partial<T>): T => methods as T

export const createDocumentRecordFixture = (overrides: Partial<DocumentRecordDto> = {}): DocumentRecordDto => ({
  id: 'document',
  sourceType: 'repository',
  sourceKey: 'document.md',
  sourcePath: 'document.md',
  currentTitle: null,
  unreferencedSince: null,
  createdAt: lifecycleFixtureCreatedAt,
  ...overrides,
})

export const createMembershipRecordFixture = (overrides: Partial<MembershipState> = {}): MembershipState => ({
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

export const createRestoredMembershipFixture = (membershipOverrides: Partial<MembershipState> = {}): Membership =>
  new Membership(createMembershipRecordFixture(membershipOverrides))

export const createDocumentIndexRecordFixture = (
  overrides: Partial<DocumentIndexRecordDto> = {},
): DocumentIndexRecordDto => ({
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
  overrides: Partial<DocumentIndexExecutionRecordDto> = {},
): DocumentIndexExecutionRecordDto => {
  const record: DocumentIndexExecutionRecordDto = {
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
