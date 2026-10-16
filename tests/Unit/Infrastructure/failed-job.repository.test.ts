import assert from 'node:assert/strict'
import test from 'node:test'

import { DataSource, EntityManager } from 'typeorm'

import { FailedJobModel } from '../../../src/Infrastructure/Persistence/Models/failed-job.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { FailedJobRepository } from '../../../src/Infrastructure/Persistence/Repositories/failed-job.repository.ts'

test('failed-job garbage collection locks only its candidate and skips contended rows', async (context) => {
  const manager = new EntityManager(new DataSource({ type: 'postgres' }))
  const failedJobModelRepository = manager.getRepository(FailedJobModel)
  const failedJob = new FailedJobModel()
  failedJob.id = 'failed-1'
  failedJob.documentId = 'document-1'
  failedJob.failedAt = new Date('2026-10-14T00:00:00.000Z')
  let available: FailedJobModel | null = failedJob
  const findOne = context.mock.method(failedJobModelRepository, 'findOne', async () => available)
  const failedJobRepository = new FailedJobRepository(new PersistenceTransaction({ manager } as DataSource))

  assert.deepEqual(await failedJobRepository.lockExpiredFailure({ failedJobId: 'failed-1' }), {
    failedJobId: 'failed-1',
    documentId: 'document-1',
    failedAt: failedJob.failedAt,
  })
  available = null
  assert.equal(await failedJobRepository.lockExpiredFailure({ failedJobId: 'failed-1' }), null)
  assert.deepEqual(findOne.mock.calls[0]?.arguments, [
    {
      where: { id: 'failed-1' },
      lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
    },
  ])
})

test('failed-job records whitelist columns and isolate Date and JSON values for reads and writes', async (context) => {
  const manager = new EntityManager(new DataSource({ type: 'postgres' }))
  const modelRepository = manager.getRepository(FailedJobModel)
  const input = {
    id: 'failure-1',
    jobId: 'job-1',
    knowledgeBaseId: 'base-1',
    documentId: 'document-1',
    documentIndexId: 'index-1',
    generation: '1',
    attempts: 2,
    errorCode: 'failed',
    errorMessage: 'failure',
    blockedReasons: [{ reason: { code: 'blocked' } }],
    retryPayload: { nested: { document: 'source' } },
    failedAt: new Date('2026-10-14T00:00:00.000Z'),
    retriedAt: new Date('2026-10-15T00:00:00.000Z'),
    createdAt: new Date('2026-10-14T00:00:00.000Z'),
    updatedAt: new Date('2026-10-15T00:00:00.000Z'),
  }
  const model = Object.assign(new FailedJobModel(), structuredClone(input))
  const original = structuredClone(input)
  context.mock.method(modelRepository, 'findOneBy', async () => model)
  context.mock.method(modelRepository, 'findBy', async () => [model])
  const save = context.mock.method(modelRepository, 'save', async () => model)
  const repository = new FailedJobRepository(new PersistenceTransaction({ manager } as DataSource))
  const found = await repository.findFailure({ id: model.id })
  const saved = await repository.archive(input)
  const records = await repository.findByDocumentIndexId({ documentIndexId: model.documentIndexId })
  assert.ok(found)
  assert.deepEqual(found, original)
  assert.deepEqual(saved, original)
  assert.deepEqual(records, [original])
  assert.equal(Object.getPrototypeOf(found), Object.prototype)
  assert.equal('documentIndex' in found, false)
  assert.notEqual(saved.failedAt, model.failedAt)
  assert.notEqual(saved.retryPayload.nested, model.retryPayload.nested)
  assert.notEqual(saved.blockedReasons[0], model.blockedReasons[0])
  assert.notEqual(save.mock.calls[0]?.arguments[0], input)
  assert.notEqual(save.mock.calls[0]?.arguments[0]?.failedAt, input.failedAt)
  assert.notEqual(save.mock.calls[0]?.arguments[0]?.retryPayload, input.retryPayload)
  found.failedAt.setTime(0)
  found.retriedAt?.setTime(0)
  found.createdAt.setTime(0)
  found.updatedAt.setTime(0)
  found.retryPayload.nested = { document: 'changed' }
  found.blockedReasons.push({ reason: { code: 'changed' } })
  assert.deepEqual(saved, original)
  assert.deepEqual(records, [original])
  assert.equal(model.failedAt.getTime(), original.failedAt.getTime())
  assert.equal(model.retriedAt?.getTime(), original.retriedAt.getTime())
  assert.equal(model.createdAt.getTime(), original.createdAt.getTime())
  assert.equal(model.updatedAt.getTime(), original.updatedAt.getTime())
  assert.deepEqual(model.retryPayload, original.retryPayload)
  assert.deepEqual(model.blockedReasons, original.blockedReasons)
})

test('failed-job retention projections copy their date and tolerate only selected fields', async (context) => {
  const manager = new EntityManager(new DataSource({ type: 'postgres' }))
  const projection = Object.assign(new FailedJobModel(), {
    id: 'failed-1',
    documentId: 'document-1',
    failedAt: new Date('2026-10-14T00:00:00.000Z'),
  })
  context.mock.method(manager.getRepository(FailedJobModel), 'find', async () => [projection])
  context.mock.method(manager.getRepository(FailedJobModel), 'findOne', async () => projection)
  const repository = new FailedJobRepository(new PersistenceTransaction({ manager } as DataSource))
  const candidates = await repository.findExpiredFailures({ cutoff: new Date() })
  const locked = await repository.lockExpiredFailure({ failedJobId: projection.id })
  const candidate = candidates[0]
  assert.ok(candidate)
  assert.ok(locked)
  assert.notEqual(candidate.failedAt, projection.failedAt)
  assert.notEqual(locked.failedAt, projection.failedAt)
  assert.equal(Object.getPrototypeOf(candidate), Object.prototype)
  candidate.failedAt.setTime(0)
  assert.equal(locked.failedAt.toISOString(), '2026-10-14T00:00:00.000Z')
  assert.equal(projection.failedAt.toISOString(), '2026-10-14T00:00:00.000Z')
})
