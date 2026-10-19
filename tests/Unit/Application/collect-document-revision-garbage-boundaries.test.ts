import assert from 'node:assert/strict'
import test from 'node:test'

import { createRepositoryStub } from './document-index-lifecycle.fixture.ts'
import type { InspectDocumentIndexRetentionUseCaseContract } from '../../../src/Application/DocumentIndexes/Contracts/inspect-document-index-retention.use-case.contract.ts'
import type { DocumentRevisionRepository } from '../../../src/Application/DocumentRevisions/Contracts/document-revision.repository.ts'
import type { CollectDocumentRevisionGarbageDTO } from '../../../src/Application/DocumentRevisions/DataTransferObjects/document-revision-garbage.dto.ts'
import { InvalidDocumentRevisionGarbageInputException } from '../../../src/Application/DocumentRevisions/Exceptions/invalid-document-revision-garbage-input.exception.ts'
import { CollectDocumentRevisionGarbageUseCase } from '../../../src/Application/DocumentRevisions/UseCases/collect-document-revision-garbage.use-case.ts'
import { DocumentRevision } from '../../../src/Domain/DocumentRevision/document-revision.ts'

const revision = new DocumentRevision({
  id: 'revision-1',
  documentId: 'document-1',
  contentSha256: 'a'.repeat(64),
  title: null,
  content: '',
  capturedAt: new Date('2026-10-01T00:00:00Z'),
  createdAt: new Date('2026-10-01T00:00:00Z'),
})
const scope = { retentionCutoff: new Date('2026-10-02T00:00:00Z'), lockedDocumentIds: ['document-1'] }

test('revision collection rejects malformed batch inputs before acquiring locks or deleting rows', async (context) => {
  const scenarios = [
    { name: 'missing input', input: undefined },
    { name: 'missing scope', input: { candidates: [] } },
    { name: 'missing locks', input: { scope: { retentionCutoff: scope.retentionCutoff }, candidates: [] } },
    { name: 'missing cutoff', input: { scope: { lockedDocumentIds: [] }, candidates: [] } },
    { name: 'invalid cutoff', input: { scope: { ...scope, retentionCutoff: new Date(NaN) }, candidates: [] } },
    { name: 'missing candidates', input: { scope } },
    { name: 'sparse candidates', input: { scope, candidates: new Array<DocumentRevision>(1) } },
    { name: 'malformed later candidate', input: { scope, candidates: [revision, undefined] } },
  ]

  await Promise.all(
    scenarios.map(({ name, input }) =>
      context.test(name, async () => {
        const useCase = new CollectDocumentRevisionGarbageUseCase(
          createRepositoryStub<DocumentRevisionRepository>({
            lockByDocumentRevisionId: async () => assert.fail('invalid input must fail before locks'),
            deleteByDocumentRevisionId: async () => assert.fail('invalid input must fail before deletion'),
          }),
          createRepositoryStub<InspectDocumentIndexRetentionUseCaseContract>({}),
        )

        await assert.rejects(
          useCase.execute(input as CollectDocumentRevisionGarbageDTO),
          InvalidDocumentRevisionGarbageInputException,
        )
      }),
    ),
  )
})

test('revision collection preserves the empty batch and unheld-parent skip behavior', async () => {
  const useCase = new CollectDocumentRevisionGarbageUseCase(
    createRepositoryStub<DocumentRevisionRepository>({
      lockByDocumentRevisionId: async () => assert.fail('unheld parent must not acquire revision locks'),
      deleteByDocumentRevisionId: async () => assert.fail('unheld parent must not delete a revision'),
    }),
    createRepositoryStub<InspectDocumentIndexRetentionUseCaseContract>({}),
  )

  assert.deepEqual(await useCase.execute({ scope, candidates: [] }), [])
  assert.deepEqual(await useCase.execute({ scope: { ...scope, lockedDocumentIds: [] }, candidates: [revision] }), [])
})
