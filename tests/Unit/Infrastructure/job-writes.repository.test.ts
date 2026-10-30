import assert from 'node:assert/strict'
import test from 'node:test'

import { DataSource, EntityManager } from 'typeorm'

import type { DocumentIndexExecutionVerificationDTO } from '../../../src/DocumentIndexes/Application/DataTransferObjects/document-index-execution-verification.dto.ts'
import { DocumentIndexExecutionStageEnum } from '../../../src/DocumentIndexes/Application/Enums/document-index-execution-stage.enum.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/DocumentIndexes/Application/Helpers/document-index-execution-lifecycle.helper.ts'
import type {
  DocumentIndexExecutionStatusFields,
  UpdateDocumentIndexExecutionQueryObject,
} from '../../../src/DocumentIndexes/Application/QueryObjects/document-index-execution.query-object.ts'
import { JobModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/job.model.ts'
import { JobRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/job.repository.ts'
import { PersistenceTransaction } from '../../../src/Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'

const createRepositoryManagerStub = (): EntityManager => new EntityManager(new DataSource({ type: 'postgres' }))

const verification: DocumentIndexExecutionVerificationDTO = {
  stage: DocumentIndexExecutionStageEnum.CLAIMED,
  completedUnits: 0,
  totalUnits: null,
  verifiedAt: null,
  claimToken: 'claim-token',
  leaseExpiresAt: '2026-10-14T00:05:00.000Z',
}

const persistedVerification = {
  stage: DocumentIndexExecutionStageEnum.CLAIMED,
  completedUnits: 0,
  totalUnits: null,
  verifiedAt: null,
  claim_token: 'claim-token',
  lease_expires_at: '2026-10-14T00:05:00.000Z',
}

test('heartbeat writes the supplied lease JSON without reading or changing job status', async (context) => {
  const manager = createRepositoryManagerStub()
  const jobModelRepository = manager.getRepository(JobModel)
  const findOne = context.mock.method(jobModelRepository, 'findOne', async () => {
    throw new Error('heartbeat persistence must not re-check the application lease decision')
  })
  const update = context.mock.method(jobModelRepository, 'update', async () => ({
    affected: 1,
    raw: [],
    generatedMaps: [],
  }))
  const reservedAt = new Date('2026-10-14T00:00:00.000Z')

  await new JobRepository(new PersistenceTransaction({ manager } as DataSource)).renewLease({
    jobId: 'job-1',
    reservedAt: reservedAt,
    leaseExpiresAt: new Date(verification.leaseExpiresAt!),
    executionVerification: verification,
  })

  assert.equal(findOne.mock.callCount(), 0)
  assert.deepEqual(update.mock.calls[0]?.arguments, [
    { id: 'job-1' },
    {
      reservedAt,
      executionVerification: persistedVerification,
      leaseExpiresAt: new Date(verification.leaseExpiresAt!),
    },
  ])
})

test('job status CAS uses caller status and reports an unmatched expected status', async (context) => {
  const manager = createRepositoryManagerStub()
  const jobModelRepository = manager.getRepository(JobModel)
  const findOne = context.mock.method(jobModelRepository, 'findOne', async () => {
    throw new Error('a status CAS must not choose a state from a prior read')
  })
  let affected = 1
  const update = context.mock.method(jobModelRepository, 'update', async () => ({
    affected,
    raw: [],
    generatedMaps: [],
  }))
  const reservedAt = new Date('2026-10-14T00:00:00.000Z')
  const write: DocumentIndexExecutionStatusFields = {
    status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
    attempts: 2,
    reservedAt,
    leaseToken: 'claim-token',
    leaseExpiresAt: new Date(verification.leaseExpiresAt!),
    executionVerification: verification,
  }
  const executionQueue = new JobRepository(new PersistenceTransaction({ manager } as DataSource))

  assert.equal(
    await executionQueue.transitionExecution({
      jobId: 'job-1',
      expectedStatus: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
      ...write,
    }),
    true,
  )
  affected = 0
  assert.equal(
    await executionQueue.transitionExecution({
      jobId: 'job-1',
      expectedStatus: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
      ...write,
    }),
    false,
  )

  assert.equal(findOne.mock.callCount(), 0)
  assert.deepEqual(update.mock.calls[0]?.arguments, [
    { id: 'job-1', status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED },
    {
      status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
      attempts: 2,
      reservedAt,
      leaseToken: 'claim-token',
      executionVerification: persistedVerification,
      leaseExpiresAt: new Date(verification.leaseExpiresAt!),
    },
  ])
})

test('retry status CAS clears lease values exactly as supplied by the caller', async (context) => {
  const manager = createRepositoryManagerStub()
  const jobModelRepository = manager.getRepository(JobModel)
  const update = context.mock.method(jobModelRepository, 'update', async () => ({
    affected: 1,
    raw: [],
    generatedMaps: [],
  }))
  const availableAt = new Date('2026-10-14T00:01:00.000Z')
  const write: DocumentIndexExecutionStatusFields = {
    status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
    availableAt,
    reservedAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    executionVerification: null,
    executionState: null,
  }

  await new JobRepository(new PersistenceTransaction({ manager } as DataSource)).transitionExecution({
    jobId: 'job-1',
    expectedStatus: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
    ...write,
  })

  assert.deepEqual(update.mock.calls[0]?.arguments, [
    { id: 'job-1', status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING },
    { ...write, leaseExpiresAt: null },
  ])
})

test('saving a job persists the caller lease value without changing its query object', async (context) => {
  const manager = createRepositoryManagerStub()
  const jobModelRepository = manager.getRepository(JobModel)
  const update = context.mock.method(jobModelRepository, 'update', async () => ({
    affected: 1,
    generatedMaps: [],
    raw: [],
  }))
  const jobRepository = new JobRepository(new PersistenceTransaction({ manager } as DataSource))
  const now = new Date('2026-10-14T00:00:00.000Z')
  const leaseExpiresAt = new Date(verification.leaseExpiresAt!)
  const saveJobQO: UpdateDocumentIndexExecutionQueryObject = {
    id: 'job-1',
    createdAt: now,
    updatedAt: now,
    knowledgeBaseId: 'base-1',
    documentId: 'document-1',
    documentIndexId: 'index-1',
    generation: '1',
    status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
    attempts: 1,
    availableAt: now,
    reservedAt: now,
    leaseToken: 'claim-token',
    leaseExpiresAt,
    idempotencyKey: null,
    retryOfFailedJobId: null,
    payload: {},
    executionState: null,
    executionVerification: persistedVerification,
  }

  const savedRecord = await jobRepository.update(saveJobQO)
  assert.equal(savedRecord, undefined)
  assert.equal(saveJobQO.leaseExpiresAt, leaseExpiresAt)
  assert.deepEqual(update.mock.calls[0]?.arguments[1]?.leaseExpiresAt, leaseExpiresAt)
  assert.notEqual(update.mock.calls[0]?.arguments[1]?.leaseExpiresAt, leaseExpiresAt)
  assert.notEqual(update.mock.calls[0]?.arguments[1]?.executionVerification, saveJobQO.executionVerification)
  assert.notEqual(update.mock.calls[0]?.arguments[1], saveJobQO)

  const saveQueuedJobQO: UpdateDocumentIndexExecutionQueryObject = {
    ...saveJobQO,
    status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
    reservedAt: null,
    leaseToken: null,
    executionVerification: null,
    leaseExpiresAt: null,
  }
  await jobRepository.update(saveQueuedJobQO)
  assert.equal(update.mock.calls[1]?.arguments[1]?.leaseExpiresAt, null)
  assert.deepEqual(
    update.mock.calls.map((call) => call.arguments),
    [
      [{ id: saveJobQO.id }, saveJobQO],
      [{ id: saveQueuedJobQO.id }, saveQueuedJobQO],
    ],
  )
})

test('saving a job does not derive lease expiry from malformed JSON', async (context) => {
  const manager = createRepositoryManagerStub()
  const jobModelRepository = manager.getRepository(JobModel)
  const update = context.mock.method(jobModelRepository, 'update', async () => ({
    affected: 1,
    generatedMaps: [],
    raw: [],
  }))
  const now = new Date('2026-10-14T00:00:00.000Z')
  const saveJobQO: UpdateDocumentIndexExecutionQueryObject = {
    id: 'job-1',
    createdAt: now,
    updatedAt: now,
    knowledgeBaseId: 'base-1',
    documentId: 'document-1',
    documentIndexId: 'index-1',
    generation: '1',
    status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
    attempts: 1,
    availableAt: now,
    reservedAt: now,
    leaseToken: 'claim-token',
    leaseExpiresAt: null,
    idempotencyKey: null,
    retryOfFailedJobId: null,
    payload: {},
    executionState: null,
    executionVerification: { lease_expires_at: 'invalid' },
  }

  await new JobRepository(new PersistenceTransaction({ manager } as DataSource)).update(saveJobQO)
  assert.equal(update.mock.calls[0]?.arguments[1]?.leaseExpiresAt, null)
  assert.deepEqual(saveJobQO.executionVerification, { lease_expires_at: 'invalid' })
})

test('new queued and retry jobs explicitly persist a null normalized expiry', async (context) => {
  const manager = createRepositoryManagerStub()
  const jobModelRepository = manager.getRepository(JobModel)
  const insert = context.mock.method(jobModelRepository, 'insert', async () => ({
    identifiers: [],
    generatedMaps: [],
    raw: [],
  }))
  const jobRepository = new JobRepository(new PersistenceTransaction({ manager } as DataSource))
  const input = {
    id: 'new-job',
    knowledgeBaseId: 'base-1',
    documentId: 'document-1',
    documentIndexId: 'index-1',
    generation: '1',
    status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
    attempts: 0,
    availableAt: new Date('2026-10-14T00:00:00.000Z'),
    reservedAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    idempotencyKey: null,
    retryOfFailedJobId: null,
    payload: {},
    executionState: null,
    executionVerification: null,
  }

  await jobRepository.enqueue(input)
  await jobRepository.enqueueRetry(input)
  assert.deepEqual(
    insert.mock.calls.map((call) => call.arguments),
    [[{ ...input, leaseExpiresAt: null }], [{ ...input, leaseExpiresAt: null }]],
  )
})
