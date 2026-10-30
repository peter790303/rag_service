import assert from 'node:assert/strict'
import test from 'node:test'

import { DocumentIndex, type DocumentIndexState } from '../../../src/DocumentIndexes/Domain/Entities/document-index.ts'
import { DocumentIndexStatusEnum } from '../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import { DocumentIndexIdentityRequiredException } from '../../../src/DocumentIndexes/Domain/Exceptions/document-index-identity-required.exception.ts'
import { InvalidDocumentIndexStateException } from '../../../src/DocumentIndexes/Domain/Exceptions/invalid-document-index-state.exception.ts'
import { InvalidDocumentIndexTimestampException } from '../../../src/DocumentIndexes/Domain/Exceptions/invalid-document-index-timestamp.exception.ts'
import { UnsupportedDocumentIndexStatusException } from '../../../src/DocumentIndexes/Domain/Exceptions/unsupported-document-index-status.exception.ts'

const indexIdentity = {
  documentId: 'document',
  revisionId: 'revision',
  pipelineHash: 'pipeline',
  chunkingModel: 'planner',
  chunkingProfile: 'chunking-v1',
  embeddingModel: 'embedding',
  embeddingDimensions: 2,
  embeddingProfile: 'embedding-v1',
  lexicalProfile: 'lexical-v1',
  relationProfile: 'relation-v1',
  createdAt: new Date('2026-10-09T00:00:00.000Z'),
}

test('referencing an existing index clears retention without changing its readiness or the prior Entity', () => {
  const readyAt = new Date('2026-10-10T00:00:00.000Z')
  const unreferencedSince = new Date('2026-10-11T00:00:00.000Z')
  const unreferencedIndex = new DocumentIndex({
    ...indexIdentity,
    id: 'index',
    status: DocumentIndexStatusEnum.READY,
    readyAt,
    unreferencedSince,
  })

  const referencedIndex = unreferencedIndex.markReferenced()

  assert.equal(referencedIndex.id, 'index')
  assert.equal(referencedIndex.status, DocumentIndexStatusEnum.READY)
  assert.equal(referencedIndex.documentId, indexIdentity.documentId)
  assert.equal(referencedIndex.revisionId, indexIdentity.revisionId)
  assert.equal(referencedIndex.pipelineHash, indexIdentity.pipelineHash)
  assert.deepEqual(referencedIndex.readyAt?.nativeDate, readyAt)
  assert.equal(referencedIndex.unreferencedSince, null)
  assert.deepEqual(unreferencedIndex.unreferencedSince?.nativeDate, unreferencedSince)
  assert.notEqual(referencedIndex, unreferencedIndex)
})

test('readiness and retention transitions preserve existing status permissions and protect lifecycle dates', () => {
  const transitionAt = new Date('2026-10-14T00:00:00.000Z')
  const failedIndex = new DocumentIndex({
    ...indexIdentity,
    id: 'index',
    status: DocumentIndexStatusEnum.FAILED,
    readyAt: null,
    unreferencedSince: null,
  })

  const retainedIndex = failedIndex.markUnreferenced(transitionAt)
  const readyIndex = retainedIndex.markReady(transitionAt)
  transitionAt.setUTCFullYear(2000)
  const exposedReadyAt = readyIndex.readyAt
  exposedReadyAt?.nativeDate.setUTCFullYear(2001)

  assert.equal(retainedIndex.status, DocumentIndexStatusEnum.FAILED)
  assert.equal(retainedIndex.readyAt, null)
  assert.equal(retainedIndex.unreferencedSince?.isoString, '2026-10-14T00:00:00.000Z')
  assert.equal(readyIndex.status, DocumentIndexStatusEnum.READY)
  assert.equal(readyIndex.readyAt?.isoString, '2026-10-14T00:00:00.000Z')
  assert.equal(readyIndex.unreferencedSince, null)
  assert.equal(failedIndex.unreferencedSince, null)
})

test('restoration and lifecycle transitions reject invalid dates with the Domain failure type', () => {
  const invalidDate = new Date(Number.NaN)

  assert.throws(
    () =>
      new DocumentIndex({
        ...indexIdentity,
        id: 'index',
        status: DocumentIndexStatusEnum.BUILDING,
        readyAt: invalidDate,
        unreferencedSince: null,
      }),
    InvalidDocumentIndexTimestampException,
  )
  const buildingIndex = new DocumentIndex({
    ...indexIdentity,
    id: 'index',
    status: DocumentIndexStatusEnum.BUILDING,
    readyAt: null,
    unreferencedSince: null,
  })
  assert.throws(() => buildingIndex.markReady(invalidDate), InvalidDocumentIndexTimestampException)
  assert.throws(() => buildingIndex.markUnreferenced(invalidDate), InvalidDocumentIndexTimestampException)
})

test('DocumentIndex construction rejects every missing persisted field with its named Domain failure', () => {
  const state: DocumentIndexState = {
    ...indexIdentity,
    id: 'index',
    status: DocumentIndexStatusEnum.BUILDING,
    readyAt: null,
    unreferencedSince: null,
  }
  const valueFields = [
    'documentId',
    'revisionId',
    'pipelineHash',
    'chunkingModel',
    'chunkingProfile',
    'embeddingModel',
    'embeddingProfile',
    'lexicalProfile',
    'relationProfile',
    'embeddingDimensions',
  ] as const
  valueFields.forEach((field) => {
    assert.throws(
      () => new DocumentIndex({ ...state, [field]: undefined } as unknown as DocumentIndexState),
      (error: unknown) => error instanceof InvalidDocumentIndexStateException && error.context.field === field,
    )
  })
  assert.throws(
    () => new DocumentIndex({ ...state, id: undefined } as unknown as DocumentIndexState),
    DocumentIndexIdentityRequiredException,
  )
  assert.throws(
    () => new DocumentIndex({ ...state, status: undefined } as unknown as DocumentIndexState),
    UnsupportedDocumentIndexStatusException,
  )
  const timestampFields = ['createdAt', 'readyAt', 'unreferencedSince'] as const
  timestampFields.forEach((field) => {
    assert.throws(
      () => new DocumentIndex({ ...state, [field]: undefined } as unknown as DocumentIndexState),
      (error: unknown) => error instanceof InvalidDocumentIndexTimestampException && error.context.field === field,
    )
  })
  assert.equal(new DocumentIndex(state).readyAt, null)
  assert.equal(new DocumentIndex(state).unreferencedSince, null)
})
