import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DocumentRevision,
  type DocumentRevisionState,
} from '../../../../src/Documents/Domain/Entities/document-revision.ts'
import { InvalidDocumentRevisionTimestampException } from '../../../../src/Documents/Domain/Exceptions/invalid-document-revision-timestamp.exception.ts'
import { DateTime } from '../../../../src/Shared/Domain/ValueObjects/date-time.ts'

function createRevision(changes: Partial<DocumentRevisionState> = {}): DocumentRevision {
  return new DocumentRevision({
    id: 'revision-1',
    documentId: 'document-1',
    contentSha256: 'a'.repeat(64),
    title: 'Title',
    content: '# Title',
    capturedAt: new Date('2026-10-15T00:00:00.000Z'),
    createdAt: new Date('2026-10-16T00:00:00.000Z'),
    ...changes,
  })
}

test('revision capture and creation times hold immutable date values and preserve distinct instants', () => {
  const capturedAt = new Date('2026-10-15T00:00:00.000Z')
  const createdAt = new Date('2026-10-16T00:00:00.000Z')
  const revision = createRevision({ capturedAt, createdAt })

  capturedAt.setTime(0)
  createdAt.setTime(0)
  revision.capturedAt.nativeDate.setTime(0)
  revision.createdAt.nativeDate.setTime(0)

  assert.equal(revision.capturedAt instanceof DateTime, true)
  assert.equal(revision.createdAt instanceof DateTime, true)
  assert.equal(revision.capturedAt.isoString, '2026-10-15T00:00:00.000Z')
  assert.equal(revision.createdAt.isoString, '2026-10-16T00:00:00.000Z')
})

test('revision retention compares creation time inclusively and accepts date values', () => {
  const createdAt = new DateTime(new Date('2026-10-16T00:00:00.000Z'))
  const revision = createRevision({ createdAt })

  assert.equal(revision.createdAt.equals(createdAt), true)
  assert.equal(revision.isRetentionExpired(new Date(createdAt.epochMilliseconds - 1)), false)
  assert.equal(revision.isRetentionExpired(createdAt), true)
  assert.equal(revision.isRetentionExpired(new Date(createdAt.epochMilliseconds + 1)), true)
})

test('invalid revision timestamps retain the existing domain exception', () => {
  assert.throws(() => createRevision({ capturedAt: new Date(Number.NaN) }), InvalidDocumentRevisionTimestampException)
  assert.throws(() => createRevision({ createdAt: new Date(Number.NaN) }), InvalidDocumentRevisionTimestampException)
  assert.throws(
    () => createRevision().isRetentionExpired(new Date(Number.NaN)),
    InvalidDocumentRevisionTimestampException,
  )
})
