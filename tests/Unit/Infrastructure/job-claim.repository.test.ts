import assert from 'node:assert/strict'
import test from 'node:test'

import { DataSource, EntityManager, In, IsNull, LessThanOrEqual, Not } from 'typeorm'

import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/DocumentIndexes/Application/Helpers/document-index-execution-lifecycle.helper.ts'
import { JobModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/job.model.ts'
import { JobRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/job.repository.ts'
import { PersistenceTransaction } from '../../../src/Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'

const createRepositoryManagerStub = (): EntityManager => new EntityManager(new DataSource({ type: 'postgres' }))

const createJobModel = (): JobModel =>
  Object.assign(new JobModel(), {
    id: 'job-1',
    knowledgeBaseId: 'base-1',
    documentId: 'document-1',
    documentIndexId: 'index-1',
    generation: '1',
    status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
    attempts: 1,
    availableAt: new Date('2026-10-15T00:00:00.000Z'),
    reservedAt: new Date('2026-10-15T00:00:00.000Z'),
    leaseToken: 'lease-1',
    leaseExpiresAt: new Date('2026-10-15T00:01:00.000Z'),
    idempotencyKey: null,
    retryOfFailedJobId: null,
    payload: { nested: { document: 'source' } },
    executionState: { steps: ['started'] },
    executionVerification: { claim_token: 'lease-1', nested: { attempt: 1 } },
    createdAt: new Date('2026-10-14T00:00:00.000Z'),
    updatedAt: new Date('2026-10-15T00:00:00.000Z'),
  })

test('expired snapshots include missing leases and the expiry boundary only for running jobs', async (context) => {
  const manager = createRepositoryManagerStub()
  const jobModelRepository = manager.getRepository(JobModel)
  const snapshots = [createJobModel()]
  const find = context.mock.method(jobModelRepository, 'find', async () => snapshots)
  const now = new Date('2026-10-15T00:00:00.000Z')

  assert.deepEqual(
    await new JobRepository(new PersistenceTransaction({ manager } as DataSource)).findExpiredExecutions({
      now,
    }),
    snapshots.map((snapshot) => ({ ...snapshot })),
  )
  assert.deepEqual(find.mock.calls[0]?.arguments, [
    {
      where: [
        { status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING, leaseExpiresAt: IsNull() },
        { status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING, leaseExpiresAt: LessThanOrEqual(now) },
      ],
      order: { documentId: 'ASC', knowledgeBaseId: 'ASC', id: 'ASC' },
    },
  ])
})

test('expired job locks constrain both expiry branches to the requested running job and skip contention', async (context) => {
  const manager = createRepositoryManagerStub()
  const jobModelRepository = manager.getRepository(JobModel)
  const findOne = context.mock.method(jobModelRepository, 'findOne', async () => null)
  const now = new Date('2026-10-15T00:00:00.000Z')

  assert.equal(
    await new JobRepository(new PersistenceTransaction({ manager } as DataSource)).lockExpiredExecution({
      jobId: 'job-1',
      now,
    }),
    null,
  )
  assert.deepEqual(findOne.mock.calls[0]?.arguments, [
    {
      where: [
        { id: 'job-1', status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING, leaseExpiresAt: IsNull() },
        { id: 'job-1', status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING, leaseExpiresAt: LessThanOrEqual(now) },
      ],
      lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
    },
  ])
})

test('queued candidates retain due-time filtering, stable order, and optional index exclusions', async (context) => {
  const manager = createRepositoryManagerStub()
  const jobModelRepository = manager.getRepository(JobModel)
  const candidate = createJobModel()
  candidate.id = 'job-1'
  const findOne = context.mock.method(jobModelRepository, 'findOne', async () => candidate)
  const executionQueue = new JobRepository(new PersistenceTransaction({ manager } as DataSource))
  const availableAt = new Date('2026-10-15T00:00:00.000Z')
  const excludedIndexes = ['index-1', 'index-2']

  assert.deepEqual(
    await executionQueue.findOldestAvailableExecution({
      availableAt,
      excludedDocumentIndexIds: excludedIndexes,
    }),
    { ...candidate },
  )
  assert.deepEqual(
    await executionQueue.findOldestAvailableExecution({
      availableAt,
      excludedDocumentIndexIds: [],
    }),
    { ...candidate },
  )
  assert.deepEqual(findOne.mock.calls[0]?.arguments, [
    {
      where: {
        status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
        availableAt: LessThanOrEqual(availableAt),
        documentIndexId: Not(In(excludedIndexes)),
      },
      order: { createdAt: 'ASC', id: 'ASC' },
    },
  ])
  assert.deepEqual(findOne.mock.calls[1]?.arguments, [
    {
      where: { status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED, availableAt: LessThanOrEqual(availableAt) },
      order: { createdAt: 'ASC', id: 'ASC' },
    },
  ])
})

test('queued job locks recheck status and due time while skipping a contended row', async (context) => {
  const manager = createRepositoryManagerStub()
  const jobModelRepository = manager.getRepository(JobModel)
  const findOne = context.mock.method(jobModelRepository, 'findOne', async () => null)
  const availableAt = new Date('2026-10-15T00:00:00.000Z')

  assert.equal(
    await new JobRepository(new PersistenceTransaction({ manager } as DataSource)).lockAvailableExecution({
      jobId: 'job-1',
      availableAt,
    }),
    null,
  )
  assert.deepEqual(findOne.mock.calls[0]?.arguments, [
    {
      where: { id: 'job-1', status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED, availableAt: LessThanOrEqual(availableAt) },
      lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
    },
  ])
})

test('claim and ordinary reads use the active manager and isolate records from ORM state', async (context) => {
  const defaultManager = createRepositoryManagerStub()
  const activeManager = createRepositoryManagerStub()
  const transaction = new PersistenceTransaction({ manager: defaultManager } as DataSource)
  const repository = new JobRepository(transaction)
  const model = createJobModel()
  // ORM relation state must not cross the technical record boundary.
  model.failedJobs = []
  const activeRepository = activeManager.getRepository(JobModel)
  context.mock.method(defaultManager, 'getRepository', () => {
    throw new Error('default manager used inside transaction')
  })
  const findOne = context.mock.method(activeRepository, 'findOne', async () => model)
  await transaction.bind(activeManager, async () => {
    const ordinary = await repository.lockExecution({ jobId: model.id })
    const claimed = await repository.lockExpiredExecution({
      jobId: model.id,
      now: model.availableAt,
    })
    assert.ok(ordinary)
    assert.ok(claimed)
    assert.equal(Object.getPrototypeOf(claimed), Object.prototype)
    assert.equal('failedJobs' in claimed, false)
    assert.deepEqual(claimed, ordinary)
    const original = structuredClone(claimed)
    claimed.availableAt.setTime(0)
    claimed.reservedAt?.setTime(0)
    claimed.leaseExpiresAt?.setTime(0)
    claimed.createdAt.setTime(0)
    claimed.updatedAt.setTime(0)
    assert.notEqual(claimed.payload.nested, model.payload.nested)
    assert.notEqual(claimed.executionState?.steps, model.executionState?.steps)
    assert.notEqual(claimed.executionVerification?.nested, model.executionVerification?.nested)
    claimed.payload.nested = { document: 'changed' }
    claimed.executionState = { steps: ['changed'] }
    claimed.executionVerification = { claim_token: 'changed' }
    assert.deepEqual(ordinary, original)
    assert.equal(model.availableAt.getTime(), original.availableAt.getTime())
    assert.equal(model.reservedAt?.getTime(), original.reservedAt?.getTime())
    assert.equal(model.leaseExpiresAt?.getTime(), original.leaseExpiresAt?.getTime())
    assert.equal(model.createdAt.getTime(), original.createdAt.getTime())
    assert.equal(model.updatedAt.getTime(), original.updatedAt.getTime())
    assert.deepEqual(model.payload, original.payload)
    assert.deepEqual(model.executionState, original.executionState)
    assert.deepEqual(model.executionVerification, original.executionVerification)
  })
  assert.equal(findOne.mock.callCount(), 2)
})

test('running sibling execution facts require only their selected columns and isolate JSON', async (context) => {
  const manager = createRepositoryManagerStub()
  const projection = Object.assign(new JobModel(), {
    id: 'sibling-1',
    status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
    attempts: 2,
    executionVerification: { claim_token: 'lease-2', nested: { attempt: 2 } },
  })
  const find = context.mock.method(manager.getRepository(JobModel), 'find', async () => [projection])
  const result = await new JobRepository(new PersistenceTransaction({ manager } as DataSource)).findSiblingExecutions({
    documentIndexId: 'index-1',
    jobId: 'job-1',
  })
  assert.deepEqual(find.mock.calls[0]?.arguments, [
    {
      where: { documentIndexId: 'index-1', status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING, id: Not('job-1') },
      select: { id: true, status: true, attempts: true, executionVerification: true },
    },
  ])
  const record = result[0]
  assert.ok(record)
  assert.equal(Object.getPrototypeOf(record), Object.prototype)
  assert.deepEqual(Object.keys(record).sort(), ['attempts', 'executionVerification', 'id', 'status'])
  assert.deepEqual(record.executionVerification, projection.executionVerification)
  assert.notEqual(record.executionVerification?.nested, projection.executionVerification.nested)
  assert.ok(record.executionVerification)
  record.executionVerification.nested = { attempt: 99 }
  assert.deepEqual(projection.executionVerification.nested, { attempt: 2 })
})
