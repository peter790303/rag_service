import assert from 'node:assert/strict'
import test from 'node:test'

import { createRestoredDocumentIndexFixture } from './document-index-lifecycle.fixture.ts'
import { createRetrievalKnowledgeBaseContentInputFixture } from './retrieval-knowledge-base-content.fixture.ts'
import { ReadDocumentIndexAssembler } from '../../../src/DocumentIndexes/Application/Assemblers/read-document-index.assembler.ts'
import { ReplacementChunkAssembler } from '../../../src/DocumentIndexes/Application/Assemblers/replacement-chunk.assembler.ts'
import { WriteLifecycleDocumentIndexAssembler } from '../../../src/DocumentIndexes/Application/Assemblers/write-lifecycle-document-index.assembler.ts'
import { WriteRequestDocumentIndexesAssembler } from '../../../src/DocumentIndexes/Application/Assemblers/write-request-document-indexes.assembler.ts'
import { IndexingDocumentRevisionAssembler } from '../../../src/Documents/Application/Assemblers/indexing-document-revision.assembler.ts'
import { IndexingDocumentAssembler } from '../../../src/Documents/Application/Assemblers/indexing-document.assembler.ts'
import { RetentionDocumentAssembler } from '../../../src/Documents/Application/Assemblers/retention-document.assembler.ts'
import { IndexingKnowledgeBaseDocumentAssembler } from '../../../src/KnowledgeBases/Application/Assemblers/indexing-knowledge-base-document.assembler.ts'
import type { DateTime } from '../../../src/Shared/Domain/ValueObjects/date-time.ts'

test('entity dates cross persistence and application record boundaries as independent native dates', () => {
  const { snapshot } = createRetrievalKnowledgeBaseContentInputFixture()
  const document = snapshot.documents[0]!
  const revision = snapshot.revisions[0]!
  const index = snapshot.indexes[0]!
  const knowledgeBaseDocument = snapshot.knowledgeBaseDocuments[0]!
  const chunk = snapshot.chunks[0]!
  const documentWrite = IndexingDocumentAssembler.toUpsertDocumentSourceQO(document)
  const revisionWrite = IndexingDocumentRevisionAssembler.toCreateDocumentRevisionQueryObject(revision)
  const indexWrite = new WriteRequestDocumentIndexesAssembler(index).toBuildingDocumentIndex(index)
  const lifecycleWrite = WriteLifecycleDocumentIndexAssembler.toSaveDocumentIndexLifecycleQO(index)
  const indexRecord = ReadDocumentIndexAssembler.toDocumentIndexRecordDTO(index)
  const knowledgeBaseDocumentWrite =
    IndexingKnowledgeBaseDocumentAssembler.toUpdateKnowledgeBaseDocumentQO(knowledgeBaseDocument)
  const chunkWrite = ReplacementChunkAssembler.toInsertChunksQueryObject([chunk]).chunks[0]!
  const boundaryDates: readonly [Date, DateTime][] = [
    [documentWrite.createdAt, document.createdAt],
    [revisionWrite.capturedAt, revision.capturedAt],
    [revisionWrite.createdAt, revision.createdAt],
    [indexWrite.createdAt, index.createdAt],
    [indexWrite.readyAt!, index.readyAt!],
    [lifecycleWrite.readyAt!, index.readyAt!],
    [indexRecord.createdAt, index.createdAt],
    [indexRecord.readyAt!, index.readyAt!],
    [knowledgeBaseDocumentWrite.updatedAt, knowledgeBaseDocument.updatedAt],
    [chunkWrite.createdAt, chunk.createdAt],
  ]

  boundaryDates.forEach(([nativeDate, domainDate]) => {
    assert.equal(nativeDate instanceof Date, true)
    assert.equal(nativeDate.getTime(), domainDate.epochMilliseconds)
    const originalTimestamp = domainDate.epochMilliseconds
    nativeDate.setTime(0)
    assert.equal(domainDate.epochMilliseconds, originalTimestamp)
  })
})

test('nullable index dates and document retention timestamps keep their persistence shapes', () => {
  const index = createRestoredDocumentIndexFixture()
  const lifecycleWrite = WriteLifecycleDocumentIndexAssembler.toSaveDocumentIndexLifecycleQO(index)
  const indexRecord = ReadDocumentIndexAssembler.toDocumentIndexRecordDTO(index)

  assert.equal(lifecycleWrite.readyAt, null)
  assert.equal(lifecycleWrite.unreferencedSince, null)
  assert.equal(indexRecord.readyAt, null)
  assert.equal(indexRecord.unreferencedSince, null)

  const document = createRetrievalKnowledgeBaseContentInputFixture().snapshot.documents[0]!
  const timestamp = new Date('2026-10-16T01:02:03.456Z')
  const retentionTime = document.startRetention(timestamp)
  const retentionWrite = RetentionDocumentAssembler.toMarkDocumentUnreferencedQO(document.id, retentionTime)
  const documentWrite = IndexingDocumentAssembler.toUpsertDocumentSourceQO(document)

  assert.deepEqual(retentionWrite.unreferencedSince, timestamp)
  assert.deepEqual(documentWrite.unreferencedSince, timestamp)
  retentionWrite.unreferencedSince.setTime(0)
  assert.equal(document.unreferencedSince?.epochMilliseconds, timestamp.getTime())
})
