import assert from 'node:assert/strict'
import test from 'node:test'

import { Document, type DocumentState } from '../../../../src/Domain/Document/document.ts'

function createDocument(documentState: Pick<DocumentState, 'id' | 'unreferencedSince'>): Document {
  return new Document({
    sourceType: 'repository',
    sourceKey: 'source',
    sourcePath: 'path',
    currentTitle: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    ...documentState,
  })
}

test('starting retention preserves the first timestamp across repeated requests', () => {
  const document = createDocument({ id: 'document-1', unreferencedSince: null })
  const first = new Date('2026-10-01T00:00:00.000Z')
  const later = new Date('2026-10-02T00:00:00.000Z')

  assert.equal(document.id, 'document-1')
  assert.equal(document.unreferencedSince, null)
  assert.deepEqual(document.startRetention(first).nativeDate, first)
  assert.deepEqual(document.startRetention(later).nativeDate, first)
  assert.equal(document.unreferencedSince, document.startRetention(first))
})

test('restoring and starting retention protect lifecycle timestamps from external mutation', () => {
  const existingTimestamp = new Date('2026-10-01T00:00:00.000Z')
  const restored = createDocument({ id: 'document-1', unreferencedSince: existingTimestamp })
  const startedAt = new Date('2026-10-02T00:00:00.000Z')
  const newlyUnreferenced = createDocument({ id: 'document-2', unreferencedSince: null })
  const retainedTimestamp = newlyUnreferenced.startRetention(startedAt)

  existingTimestamp.setTime(0)
  startedAt.setTime(0)
  retainedTimestamp.nativeDate.setTime(0)
  restored.unreferencedSince?.nativeDate.setTime(0)

  assert.deepEqual(restored.unreferencedSince?.nativeDate, new Date('2026-10-01T00:00:00.000Z'))
  assert.deepEqual(newlyUnreferenced.unreferencedSince?.nativeDate, new Date('2026-10-02T00:00:00.000Z'))
})

test('retention expires at the supplied cutoff only after it has started', () => {
  const cutoff = new Date('2026-10-01T00:00:00.000Z')
  const referenced = createDocument({ id: 'referenced', unreferencedSince: null })
  const expired = createDocument({ id: 'expired', unreferencedSince: new Date(cutoff.getTime() - 1) })
  const boundary = createDocument({ id: 'boundary', unreferencedSince: cutoff })
  const recent = createDocument({ id: 'recent', unreferencedSince: new Date(cutoff.getTime() + 1) })

  assert.equal(referenced.isRetentionExpired(cutoff), false)
  assert.equal(expired.isRetentionExpired(cutoff), true)
  assert.equal(boundary.isRetentionExpired(cutoff), true)
  assert.equal(recent.isRetentionExpired(cutoff), false)
})
