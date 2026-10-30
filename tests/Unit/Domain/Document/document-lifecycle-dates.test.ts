import assert from 'node:assert/strict'
import test from 'node:test'

import { Chunk } from '../../../../src/Chunks/Domain/Entities/chunk.ts'
import { DocumentIndex } from '../../../../src/DocumentIndexes/Domain/Entities/document-index.ts'
import { DocumentIndexStatusEnum } from '../../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import { DocumentRevision } from '../../../../src/DocumentRevisions/Domain/Entities/document-revision.ts'
import { Document } from '../../../../src/Documents/Domain/Entities/document.ts'
import { InvalidDocumentTimestampException } from '../../../../src/Documents/Domain/Exceptions/invalid-document-timestamp.exception.ts'
import { KnowledgeBaseDocument } from '../../../../src/KnowledgeBaseDocuments/Domain/Entities/knowledge-base-document.ts'
import { DateTime } from '../../../../src/Shared/Domain/ValueObjects/date-time.ts'

const timestamp = new DateTime(new Date('2026-10-16T20:34:56.789Z'), { timeZone: 'Asia/Taipei' })

function createDocument(): Document {
  return new Document({
    id: 'document-1',
    sourceType: 'repository',
    sourceKey: 'source',
    sourcePath: 'path',
    currentTitle: null,
    createdAt: timestamp,
    unreferencedSince: timestamp,
  })
}

function createIndex(): DocumentIndex {
  return new DocumentIndex({
    id: 'index-1',
    documentId: 'document-1',
    revisionId: 'revision-1',
    pipelineHash: 'pipeline',
    chunkingModel: 'chunker',
    chunkingProfile: 'chunking',
    embeddingModel: 'embedding',
    embeddingDimensions: 2,
    embeddingProfile: 'embedding',
    lexicalProfile: 'lexical',
    relationProfile: 'relation',
    status: DocumentIndexStatusEnum.READY,
    createdAt: timestamp,
    readyAt: timestamp,
    unreferencedSince: timestamp,
  })
}

function createKnowledgeBaseDocument(): KnowledgeBaseDocument {
  return new KnowledgeBaseDocument({
    knowledgeBaseId: 'knowledge-base-1',
    documentId: 'document-1',
    requestedGeneration: '0',
    activeDocumentIndexId: 'index-1',
    isEntry: true,
    alwaysIncludeFullContent: false,
    updatedAt: timestamp,
  })
}

test('all nine lifecycle fields hold the same date value type and retain explicit display options', () => {
  const document = createDocument()
  const index = createIndex()
  const knowledgeBaseDocument = createKnowledgeBaseDocument()
  const revision = new DocumentRevision({
    id: 'revision-1',
    documentId: 'document-1',
    contentSha256: 'a'.repeat(64),
    title: null,
    content: '',
    capturedAt: timestamp,
    createdAt: timestamp,
  })
  const chunk = new Chunk({
    id: 'chunk-1',
    documentIndexId: 'index-1',
    ordinal: 0,
    headingPath: [],
    content: '',
    blockStart: 0,
    blockEnd: 0,
    tokenCount: null,
    embedding: [0.1, 0.2],
    searchVector: null,
    createdAt: timestamp,
  })
  const dates = [
    document.createdAt,
    document.unreferencedSince,
    revision.capturedAt,
    revision.createdAt,
    index.createdAt,
    index.readyAt,
    index.unreferencedSince,
    chunk.createdAt,
    knowledgeBaseDocument.updatedAt,
  ]

  dates.forEach((date) => {
    assert.ok(date instanceof DateTime)
    assert.equal(date.equals(timestamp), true)
    assert.equal(date.dateTimeText, '2026-10-17 04:34:56.789')
  })
})

test('index and knowledgeBaseDocument transitions accept immutable date values without changing earlier Entities', () => {
  const index = createIndex()
  const knowledgeBaseDocument = createKnowledgeBaseDocument()
  const nextTime = new DateTime(new Date(timestamp.epochMilliseconds + 1))
  const ready = index.markReady(nextTime)
  const retained = ready.markUnreferenced(nextTime)
  const configured = knowledgeBaseDocument.configure({ isEntry: false }, nextTime)
  const requested = configured.requestIndex({ generation: '1', activeDocumentIndexId: 'index-2' }, nextTime)
  const activated = requested.activateIndex('index-3', nextTime)
  const detached = activated.detachIndex(nextTime)

  assert.equal(ready.readyAt?.equals(nextTime), true)
  assert.equal(retained.unreferencedSince?.equals(nextTime), true)
  assert.equal(retained.markReferenced().unreferencedSince, null)
  assert.equal(index.readyAt?.equals(timestamp), true)
  assert.equal(index.unreferencedSince?.equals(timestamp), true)
  assert.equal(detached.updatedAt.equals(nextTime), true)
  assert.equal(detached.activeDocumentIndexId, null)
  assert.equal(knowledgeBaseDocument.updatedAt.equals(timestamp), true)
  assert.equal(knowledgeBaseDocument.isEntry, true)
})

test('document rejects invalid retention input even when a previous retention time already exists', () => {
  const document = createDocument()

  assert.throws(() => document.startRetention(new Date(Number.NaN)), InvalidDocumentTimestampException)
  assert.throws(() => document.isRetentionExpired(new Date(Number.NaN)), InvalidDocumentTimestampException)
  assert.equal(document.startRetention(timestamp).equals(timestamp), true)
})
