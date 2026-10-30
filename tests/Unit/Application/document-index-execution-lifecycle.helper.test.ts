import assert from 'node:assert/strict'
import test from 'node:test'

import { DocumentIndexExecutionClaimLimitReachedException } from '../../../src/DocumentIndexes/Application/Exceptions/document-index-execution-claim-limit-reached.exception.ts'
import { DocumentIndexExecutionClaimRequiresQueuedStateException } from '../../../src/DocumentIndexes/Application/Exceptions/document-index-execution-claim-requires-queued-state.exception.ts'
import { DocumentIndexExecutionIdentityRequiredException } from '../../../src/DocumentIndexes/Application/Exceptions/document-index-execution-identity-required.exception.ts'
import { InvalidDocumentIndexExecutionAttemptCountException } from '../../../src/DocumentIndexes/Application/Exceptions/invalid-document-index-execution-attempt-count.exception.ts'
import { InvalidDocumentIndexExecutionLeaseDurationException } from '../../../src/DocumentIndexes/Application/Exceptions/invalid-document-index-execution-lease-duration.exception.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../../src/DocumentIndexes/Application/Exceptions/invalid-document-index-execution-lease.exception.ts'
import { InvalidDocumentIndexExecutionTimestampException } from '../../../src/DocumentIndexes/Application/Exceptions/invalid-document-index-execution-timestamp.exception.ts'
import {
  DOCUMENT_INDEX_EXECUTION_STATUS,
  DocumentIndexExecutionLifecycle,
} from '../../../src/DocumentIndexes/Application/Helpers/document-index-execution-lifecycle.helper.ts'

const now = new Date('2026-10-15T00:00:00.000Z')
const queuedState = { id: 'job', status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED, attempts: 0, leaseExpiresAt: null }

test('document index execution lifecycle distinguishes invalid attempts, timestamps and exhausted claims', () => {
  assert.throws(
    () => new DocumentIndexExecutionLifecycle({ ...queuedState, attempts: -1 }),
    InvalidDocumentIndexExecutionAttemptCountException,
  )
  assert.throws(
    () => new DocumentIndexExecutionLifecycle({ ...queuedState, leaseExpiresAt: new Date(NaN) }),
    InvalidDocumentIndexExecutionTimestampException,
  )
  assert.throws(
    () => new DocumentIndexExecutionLifecycle({ ...queuedState, attempts: 4 }).nextClaimAttempts(),
    DocumentIndexExecutionClaimLimitReachedException,
  )
  assert.throws(
    () =>
      new DocumentIndexExecutionLifecycle({
        ...queuedState,
        status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
      }).nextClaimAttempts(),
    DocumentIndexExecutionClaimRequiresQueuedStateException,
  )
  assert.equal(new DocumentIndexExecutionLifecycle(queuedState).nextClaimAttempts(), 1)
})

test('document index execution lifecycle distinguishes invalid lease configuration from invalid state', () => {
  const lifecycle = new DocumentIndexExecutionLifecycle(queuedState)
  const testCases = [0, -1, NaN, Infinity]
  testCases.forEach((duration) => {
    assert.throws(() => lifecycle.leaseExpiryFrom(now, duration), InvalidDocumentIndexExecutionLeaseDurationException)
  })
  assert.throws(() => lifecycle.leaseExpiryFrom(new Date(NaN), 60), InvalidDocumentIndexExecutionTimestampException)
  assert.equal(lifecycle.leaseExpiryFrom(now, 60).getTime(), now.getTime() + 60_000)
})

test('lease ownership failures retain their code and expose the current exception name', () => {
  const failure = new InvalidDocumentIndexExecutionLeaseException()
  assert.equal(failure.name, InvalidDocumentIndexExecutionLeaseException.name)
  assert.equal(failure.code, 'INVALID_RAG_JOB_LEASE')
})

test('execution lifecycle rejects missing required input without coercing it into a cleared lease', () => {
  assert.throws(
    () => new DocumentIndexExecutionLifecycle({ ...queuedState, id: undefined as unknown as string }),
    DocumentIndexExecutionIdentityRequiredException,
  )
  assert.throws(
    () => new DocumentIndexExecutionLifecycle({ ...queuedState, attempts: undefined as unknown as number }),
    InvalidDocumentIndexExecutionAttemptCountException,
  )
  ;[undefined, '2026-10-15T00:00:00.000Z', 0].forEach((leaseExpiresAt) => {
    assert.throws(
      () => new DocumentIndexExecutionLifecycle({ ...queuedState, leaseExpiresAt: leaseExpiresAt as unknown as Date }),
      InvalidDocumentIndexExecutionTimestampException,
    )
  })
  assert.equal(new DocumentIndexExecutionLifecycle(queuedState).leaseExpiresAt, null)
})

test('execution lifecycle validates timestamp inputs and computed lease or retry overflow before persistence mapping', () => {
  const lifecycle = new DocumentIndexExecutionLifecycle(queuedState)
  assert.throws(
    () => lifecycle.leaseExpiryFrom(undefined as unknown as Date, 60),
    InvalidDocumentIndexExecutionTimestampException,
  )
  assert.throws(() => lifecycle.leaseExpiryFrom(now, Number.MAX_VALUE), InvalidDocumentIndexExecutionTimestampException)
  assert.throws(
    () => lifecycle.canRenewLeaseAt(now, undefined as unknown as Date),
    InvalidDocumentIndexExecutionTimestampException,
  )
  assert.throws(
    () => lifecycle.afterFailure({ errorMessage: 'failed', failedAt: new Date(8_640_000_000_000_000) }),
    InvalidDocumentIndexExecutionTimestampException,
  )
})
