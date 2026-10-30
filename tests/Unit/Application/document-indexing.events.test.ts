import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { DocumentIndexingDeliveryDTO } from '../../../src/DocumentIndexes/Application/DataTransferObjects/document-indexing-delivery.dto.ts'
import { DocumentIndexedEvent } from '../../../src/DocumentIndexes/Application/Events/document-indexed.event.ts'
import { DocumentIndexingDispatchedEvent } from '../../../src/DocumentIndexes/Application/Events/document-indexing-dispatched.event.ts'
import { DocumentIndexingFailedEvent } from '../../../src/DocumentIndexes/Application/Events/document-indexing-failed.event.ts'

function createDelivery(): DocumentIndexingDeliveryDTO {
  return {
    id: 'job',
    knowledgeBaseId: 'knowledge-base',
    documentId: 'document',
    documentIndexId: 'document-index',
    generation: '9007199254740993',
    attempts: 2,
    leaseToken: 'lease-token',
    leaseExpiresAt: new Date('2026-10-15T00:05:00.000Z'),
  }
}

test('dispatch snapshots the exact execution fencing fields without losing generation precision', () => {
  const delivery = createDelivery()
  const event = new DocumentIndexingDispatchedEvent(delivery)
  const expiresAt = delivery.leaseExpiresAt.getTime()

  delivery.leaseExpiresAt.setTime(0)

  assert.equal(event.jobId, delivery.id)
  assert.equal(event.generation, '9007199254740993')
  assert.equal(event.leaseExpiresAt.getTime(), expiresAt)
  assert.deepEqual(Object.keys(event).sort(), [
    'attempts',
    'documentId',
    'documentIndexId',
    'generation',
    'jobId',
    'knowledgeBaseId',
    'leaseExpiresAt',
    'leaseToken',
  ])
})

test('completion snapshots the delivery lease and completion time', () => {
  const delivery = createDelivery()
  const completedAt = new Date('2026-10-15T00:01:00.000Z')
  const event = new DocumentIndexedEvent({ jobDelivery: delivery, completedAt })

  delivery.leaseExpiresAt.setTime(0)
  completedAt.setTime(0)

  assert.equal(event.jobDelivery.leaseExpiresAt.toISOString(), '2026-10-15T00:05:00.000Z')
  assert.equal(event.completedAt.toISOString(), '2026-10-15T00:01:00.000Z')
})

test('failure snapshots its lease and retry decision dates', () => {
  const delivery = createDelivery()
  const failedAt = new Date('2026-10-15T00:01:00.000Z')
  const retryAt = new Date('2026-10-15T00:02:00.000Z')
  const event = new DocumentIndexingFailedEvent({
    jobDelivery: delivery,
    failureDecision: { errorCode: 'INDEXING_FAILED', errorMessage: 'failed', failedAt, retryAt },
  })

  delivery.leaseExpiresAt.setTime(0)
  failedAt.setTime(0)
  retryAt.setTime(0)

  assert.equal(event.jobDelivery.leaseExpiresAt.toISOString(), '2026-10-15T00:05:00.000Z')
  assert.equal(event.failureDecision.failedAt.toISOString(), '2026-10-15T00:01:00.000Z')
  assert.equal(event.failureDecision.retryAt?.toISOString(), '2026-10-15T00:02:00.000Z')
})
