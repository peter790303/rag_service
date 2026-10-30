import assert from 'node:assert/strict'
import test from 'node:test'

import type { KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import type { DocumentIndexingClaimDTO } from '../../../src/DocumentIndexes/Application/DTOs/document-indexing-claim.dto.ts'
import { DocumentIndexExecutionStageEnum } from '../../../src/DocumentIndexes/Application/Enums/document-index-execution-stage.enum.ts'
import { DocumentIndexingDispatchedEvent } from '../../../src/DocumentIndexes/Application/Events/document-indexing-dispatched.event.ts'
import { KnowledgeMaintenanceWorker } from '../../../src/DocumentIndexes/Interfaces/Console/Workers/knowledge-maintenance-worker.ts'
import { DocumentGarbageCollectionRequestedEvent } from '../../../src/Documents/Application/Events/document-garbage-collection-requested.event.ts'

const config = { workerPollMs: 5, gcPollMs: 5 } satisfies Pick<KnowledgeServiceConfig, 'workerPollMs' | 'gcPollMs'>
const createGarbageCollectionListenerFixture = { handle: async () => undefined }
const createClaimedJobFixture = (): DocumentIndexingClaimDTO => ({
  id: 'job',
  knowledgeBaseId: 'knowledge-base',
  documentId: 'document',
  documentIndexId: 'index',
  generation: '9007199254740993',
  attempts: 2,
  leaseToken: 'claim-token',
  leaseExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
  executionVerification: {
    stage: DocumentIndexExecutionStageEnum.CLAIMED,
    completedUnits: 0,
    totalUnits: null,
    verifiedAt: null,
  },
})

const createDeferredJobPromise = <T>() => {
  let resolve!: (jobPromiseValue: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

test('does not emit an event for an empty durable queue', async () => {
  const events: DocumentIndexingDispatchedEvent[] = []
  const worker = new KnowledgeMaintenanceWorker(
    createGarbageCollectionListenerFixture,
    { handle: async () => null },
    {
      handle: async (event) => {
        events.push(event)
      },
    },
    config,
  )

  await worker.deliverNextJob()

  assert.equal(events.length, 0)
})

test('waits for the committed claim before delivering an event and prevents overlapping claims', async () => {
  const claimResult = createDeferredJobPromise<DocumentIndexingClaimDTO>()
  const events: DocumentIndexingDispatchedEvent[] = []
  let claims = 0
  const worker = new KnowledgeMaintenanceWorker(
    createGarbageCollectionListenerFixture,
    {
      handle: async () => {
        claims += 1

        return claimResult.promise
      },
    },
    {
      handle: async (event) => {
        events.push(event)
      },
    },
    config,
  )
  const delivery = worker.deliverNextJob()

  await worker.deliverNextJob()
  assert.equal(claims, 1)
  assert.equal(events.length, 0)

  const claim = createClaimedJobFixture()
  claimResult.resolve(claim)
  await delivery

  assert.equal(events.length, 1)
  assert.ok(events[0] instanceof DocumentIndexingDispatchedEvent)
  assert.equal(events[0].jobId, claim.id)
  assert.equal(events[0].generation, claim.generation)
  assert.equal(events[0].leaseToken, claim.leaseToken)
})

test('holds the delivery slot until the listener completes, then permits the next claim', async () => {
  const listenerStarted = createDeferredJobPromise<void>()
  const listenerResult = createDeferredJobPromise<void>()
  let claims = 0
  const worker = new KnowledgeMaintenanceWorker(
    createGarbageCollectionListenerFixture,
    {
      handle: async () => {
        claims += 1

        return createClaimedJobFixture()
      },
    },
    {
      handle: async () => {
        listenerStarted.resolve(undefined)
        await listenerResult.promise
      },
    },
    config,
  )
  const delivery = worker.deliverNextJob()

  await listenerStarted.promise
  await worker.deliverNextJob()
  assert.equal(claims, 1)

  listenerResult.resolve(undefined)
  await delivery
  await worker.deliverNextJob()
  assert.equal(claims, 2)
})

test('releases the delivery slot after either a claim or listener rejection', async () => {
  let claims = 0
  let deliveries = 0
  const worker = new KnowledgeMaintenanceWorker(
    createGarbageCollectionListenerFixture,
    {
      handle: async () => {
        claims += 1

        if (claims === 1) throw new Error('claim unavailable')

        return createClaimedJobFixture()
      },
    },
    {
      handle: async () => {
        deliveries += 1

        if (deliveries === 1) throw new Error('delivery unavailable')
      },
    },
    config,
  )

  await assert.rejects(worker.deliverNextJob(), /claim unavailable/u)
  await assert.rejects(worker.deliverNextJob(), /delivery unavailable/u)
  await worker.deliverNextJob()

  assert.equal(claims, 3)
  assert.equal(deliveries, 2)
})

test('waits for garbage collection event handling before completing delivery', async () => {
  const listenerStarted = createDeferredJobPromise<DocumentGarbageCollectionRequestedEvent>()
  const listenerCompleted = createDeferredJobPromise<void>()
  const worker = new KnowledgeMaintenanceWorker(
    {
      handle: async (event) => {
        listenerStarted.resolve(event)
        await listenerCompleted.promise
      },
    },
    { handle: async () => null },
    { handle: async () => undefined },
    config,
  )
  let delivered = false
  const delivery = worker.deliverGarbageCollection().then(() => {
    delivered = true
  })
  const event = await listenerStarted.promise

  assert.ok(event instanceof DocumentGarbageCollectionRequestedEvent)
  assert.ok(Number.isFinite(event.requestedAt.getTime()))
  assert.equal(delivered, false)

  listenerCompleted.resolve(undefined)
  await delivery
  assert.equal(delivered, true)
})

test('continues polling after rejected background executions', { timeout: 1000 }, async () => {
  let indexExecutions = 0
  let garbageCollections = 0
  const indexPollingContinued = createDeferredJobPromise<void>()
  const garbageCollectionContinued = createDeferredJobPromise<void>()
  const worker = new KnowledgeMaintenanceWorker(
    {
      handle: async (event) => {
        assert.ok(event instanceof DocumentGarbageCollectionRequestedEvent)
        garbageCollections += 1

        if (garbageCollections === 1) throw new Error('database unavailable')

        garbageCollectionContinued.resolve()

        return undefined
      },
    },
    {
      handle: async () => {
        indexExecutions += 1

        if (indexExecutions === 1) throw new Error('database unavailable')

        indexPollingContinued.resolve()

        return createClaimedJobFixture()
      },
    },
    { handle: async () => undefined },
    config,
  )

  worker.onModuleInit()
  const pollingDeadline = setTimeout(() => {
    indexPollingContinued.resolve()
    garbageCollectionContinued.resolve()
  }, 800)

  try {
    await Promise.all([indexPollingContinued.promise, garbageCollectionContinued.promise])
  } finally {
    clearTimeout(pollingDeadline)
    worker.onModuleDestroy()
  }

  assert.ok(indexExecutions > 1, 'index processing should continue after a rejected execution')
  assert.ok(garbageCollections > 1, 'garbage collection should continue after a rejected execution')
})
