import assert from 'node:assert/strict'
import test from 'node:test'

import { createRepositoryStub } from './document-index-lifecycle.fixture.ts'
import type { ChunkRepository } from '../../../src/Application/Chunks/Contracts/chunk.repository.ts'
import type { IndexChunkGarbageDto } from '../../../src/Application/Chunks/DataTransferObjects/index-chunk-garbage.dto.ts'
import { ChunkGarbageCollectionLockRequiredException } from '../../../src/Application/Chunks/Exceptions/chunk-garbage-collection-lock-required.exception.ts'
import { IndexChunkGarbageCollectionNotEligibleException } from '../../../src/Application/Chunks/Exceptions/index-chunk-garbage-collection-not-eligible.exception.ts'
import { InvalidIndexChunkGarbageInputException } from '../../../src/Application/Chunks/Exceptions/invalid-index-chunk-garbage-input.exception.ts'
import { CollectIndexChunkGarbageUseCase } from '../../../src/Application/Chunks/UseCases/collect-index-chunk-garbage.use-case.ts'
import { ChunkDocumentIndexRequiredException } from '../../../src/Domain/Chunk/Exceptions/chunk-document-index-required.exception.ts'

const eligibleGarbage: IndexChunkGarbageDto = {
  documentIndexId: 'index',
  documentId: 'document',
  unreferencedSince: new Date('2026-01-01T00:00:00.000Z'),
  retentionCutoff: new Date('2026-02-01T00:00:00.000Z'),
  lockedDocumentIds: ['document'],
}

test('chunk garbage collection requires the matching parent lock before removing chunks', async () => {
  const useCase = new CollectIndexChunkGarbageUseCase(
    createRepositoryStub<ChunkRepository>({
      removeByDocumentIndexId: async () => assert.fail('unlocked chunks must not be removed'),
    }),
  )

  await assert.rejects(
    useCase.execute({ ...eligibleGarbage, lockedDocumentIds: ['other-document'] }),
    ChunkGarbageCollectionLockRequiredException,
  )
})

test('chunk garbage collection rejects referenced and unexpired indexes before removing chunks', async () => {
  const useCase = new CollectIndexChunkGarbageUseCase(
    createRepositoryStub<ChunkRepository>({
      removeByDocumentIndexId: async () => assert.fail('ineligible chunks must not be removed'),
    }),
  )

  for (const unreferencedSince of [null, new Date('2026-03-01T00:00:00.000Z')]) {
    await assert.rejects(
      useCase.execute({ ...eligibleGarbage, unreferencedSince }),
      IndexChunkGarbageCollectionNotEligibleException,
    )
  }
})

test('chunk garbage collection removes an expired index once its parent is locked', async () => {
  const removedIndexes: string[] = []
  const useCase = new CollectIndexChunkGarbageUseCase(
    createRepositoryStub<ChunkRepository>({
      removeByDocumentIndexId: async (chunkIndexQO) => {
        removedIndexes.push(chunkIndexQO.documentIndexId)
      },
    }),
  )

  await useCase.execute({ ...eligibleGarbage, unreferencedSince: eligibleGarbage.retentionCutoff })
  assert.deepEqual(removedIndexes, [eligibleGarbage.documentIndexId])
})

test('chunk garbage collection awaits the scoped deletion and propagates persistence failures', async () => {
  let finishDeletion: () => void = () => assert.fail('deletion must start before completion')
  const deletionPending = new Promise<void>((resolveDeletion) => {
    finishDeletion = resolveDeletion
  })
  let collectionCompleted = false
  const collectIndexChunkGarbage = new CollectIndexChunkGarbageUseCase(
    createRepositoryStub<ChunkRepository>({
      removeByDocumentIndexId: async (chunkIndexQO) => {
        assert.deepEqual(chunkIndexQO, { documentIndexId: eligibleGarbage.documentIndexId })
        await deletionPending
      },
    }),
  )
  const collectionPending = collectIndexChunkGarbage.execute(eligibleGarbage).then(() => {
    collectionCompleted = true
  })

  await Promise.resolve()
  assert.equal(collectionCompleted, false)
  finishDeletion()
  await collectionPending
  assert.equal(collectionCompleted, true)

  const persistenceFailure = new Error('scoped chunk deletion failed')
  const collectFailingIndexChunkGarbage = new CollectIndexChunkGarbageUseCase(
    createRepositoryStub<ChunkRepository>({
      removeByDocumentIndexId: async () => {
        throw persistenceFailure
      },
    }),
  )
  await assert.rejects(collectFailingIndexChunkGarbage.execute(eligibleGarbage), (error: unknown) => {
    assert.equal(error, persistenceFailure)

    return true
  })
})

test('chunk garbage collection rejects missing write scope and invalid retention facts before deletion', async (context) => {
  const scenarios = [
    {
      name: 'missing index',
      input: { ...eligibleGarbage, documentIndexId: undefined },
      exception: ChunkDocumentIndexRequiredException,
    },
    {
      name: 'missing document',
      input: { ...eligibleGarbage, documentId: undefined },
      exception: InvalidIndexChunkGarbageInputException,
    },
    {
      name: 'missing lock facts',
      input: { ...eligibleGarbage, lockedDocumentIds: undefined },
      exception: InvalidIndexChunkGarbageInputException,
    },
    {
      name: 'missing unreferenced time',
      input: { ...eligibleGarbage, unreferencedSince: undefined },
      exception: InvalidIndexChunkGarbageInputException,
    },
    {
      name: 'invalid unreferenced time',
      input: { ...eligibleGarbage, unreferencedSince: new Date(NaN) },
      exception: InvalidIndexChunkGarbageInputException,
    },
    {
      name: 'missing cutoff',
      input: { ...eligibleGarbage, retentionCutoff: undefined },
      exception: InvalidIndexChunkGarbageInputException,
    },
  ]

  await Promise.all(
    scenarios.map(({ name, input, exception }) =>
      context.test(name, async () => {
        const useCase = new CollectIndexChunkGarbageUseCase(
          createRepositoryStub<ChunkRepository>({
            removeByDocumentIndexId: async () => assert.fail('invalid scope or retention facts must not delete chunks'),
          }),
        )
        await assert.rejects(useCase.execute(input as IndexChunkGarbageDto), exception)
      }),
    ),
  )
})
