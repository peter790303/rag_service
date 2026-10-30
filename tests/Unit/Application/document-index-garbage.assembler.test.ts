import assert from 'node:assert/strict'
import test from 'node:test'

import { createDocumentIndexRecordFixture } from './document-index-lifecycle.fixture.ts'
import { InvalidIndexChunkGarbageInputException } from '../../../src/Chunks/Application/Exceptions/invalid-index-chunk-garbage-input.exception.ts'
import { ChunkDocumentIndexRequiredException } from '../../../src/Chunks/Domain/Exceptions/chunk-document-index-required.exception.ts'
import { DocumentIndexGarbageAssembler } from '../../../src/DocumentIndexes/Application/Assemblers/document-index-garbage.assembler.ts'
import type { DocumentIndexRecordDTO } from '../../../src/DocumentIndexes/Application/DataTransferObjects/document-index-record.dto.ts'
import type { DocumentGarbageCollectionScopeDTO } from '../../../src/Documents/Application/DataTransferObjects/document-garbage-collection-scope.dto.ts'

const documentGarbageCollectionScopeDTO: DocumentGarbageCollectionScopeDTO = {
  retentionCutoff: new Date('2026-02-01T00:00:00.000Z'),
  lockedDocumentIds: ['document'],
}

test('chunk garbage command conversion rejects invalid required index IDs at the creation boundary', () => {
  const invalidIndexIds = [undefined, null, 42, '', ' ']

  invalidIndexIds.forEach((id) => {
    assert.throws(
      () =>
        DocumentIndexGarbageAssembler.toCollectIndexChunkGarbageCommand(
          { ...createDocumentIndexRecordFixture(), id } as DocumentIndexRecordDTO,
          documentGarbageCollectionScopeDTO,
        ),
      ChunkDocumentIndexRequiredException,
    )
  })

  assert.throws(
    () =>
      DocumentIndexGarbageAssembler.toCollectIndexChunkGarbageCommand(
        undefined as unknown as DocumentIndexRecordDTO,
        documentGarbageCollectionScopeDTO,
      ),
    ChunkDocumentIndexRequiredException,
  )
})

test('chunk garbage command conversion rejects malformed document and retention fields', () => {
  const invalidFields = [
    { field: 'documentId', values: [undefined, null, 42, '', ' '] },
    { field: 'unreferencedSince', values: [undefined, '2026-01-01', 0, new Date(NaN)] },
  ]

  invalidFields.forEach(({ field, values }) => {
    values.forEach((value) => {
      assert.throws(
        () =>
          DocumentIndexGarbageAssembler.toCollectIndexChunkGarbageCommand(
            { ...createDocumentIndexRecordFixture(), [field]: value },
            documentGarbageCollectionScopeDTO,
          ),
        { name: 'InvalidIndexChunkGarbageInputException', field },
      )
    })
  })
})

test('chunk garbage command conversion rejects malformed scope and invalid dates', () => {
  const invalidFields = [
    { field: 'retentionCutoff', values: [undefined, null, '2026-02-01', 0, new Date(NaN)] },
    { field: 'lockedDocumentIds', values: [undefined, null, 'document', [42], [null], [' '], Array(1)] },
  ]

  invalidFields.forEach(({ field, values }) => {
    values.forEach((value) => {
      assert.throws(
        () =>
          DocumentIndexGarbageAssembler.toCollectIndexChunkGarbageCommand(createDocumentIndexRecordFixture(), {
            ...documentGarbageCollectionScopeDTO,
            [field]: value,
          }),
        { name: 'InvalidIndexChunkGarbageInputException', field },
      )
    })
  })

  assert.throws(
    () =>
      DocumentIndexGarbageAssembler.toCollectIndexChunkGarbageCommand(
        createDocumentIndexRecordFixture(),
        undefined as unknown as DocumentGarbageCollectionScopeDTO,
      ),
    InvalidIndexChunkGarbageInputException,
  )
})

test('chunk garbage command conversion preserves null, timestamps and lock facts without deciding eligibility', () => {
  const retentionCutoff = documentGarbageCollectionScopeDTO.retentionCutoff
  const lockedDocumentIds = Object.freeze(['other-document', 'other-document'])
  const documentGarbageScopeDTO = Object.freeze({ retentionCutoff, lockedDocumentIds })
  const retentionTimestamps = [null, retentionCutoff, new Date('2026-03-01T00:00:00.000Z')]

  retentionTimestamps.forEach((unreferencedSince) => {
    const documentIndexRecordDTO = Object.freeze(createDocumentIndexRecordFixture({ unreferencedSince }))
    const indexChunkGarbageCommand = DocumentIndexGarbageAssembler.toCollectIndexChunkGarbageCommand(
      documentIndexRecordDTO,
      documentGarbageScopeDTO,
    )

    assert.deepEqual(indexChunkGarbageCommand, {
      documentIndexId: 'index',
      documentId: 'document',
      unreferencedSince,
      retentionCutoff,
      lockedDocumentIds,
    })
  })
})
