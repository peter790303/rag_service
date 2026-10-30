import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createRepositoryStub,
  createRestoredDocumentIndexFixture,
  createRestoredKnowledgeBaseDocumentFixture,
} from './document-index-lifecycle.fixture.ts'
import type { CollectIndexChunkGarbageCommandHandlerContract } from '../../../src/Chunks/Application/Contracts/collect-index-chunk-garbage.command.handler.contract.ts'
import { CollectDocumentIndexGarbageCommandHandler } from '../../../src/DocumentIndexes/Application/Commands/collect-document-index-garbage.command.handler.ts'
import type { DocumentIndexExecutionQueue } from '../../../src/DocumentIndexes/Application/Ports/Out/Gateways/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../../../src/DocumentIndexes/Application/Ports/Out/Gateways/document-index-failure.archive.ts'
import type { DocumentIndexRepository } from '../../../src/DocumentIndexes/Application/Ports/Out/Repositories/document-index.repository.ts'
import type { DocumentIndex } from '../../../src/DocumentIndexes/Domain/Entities/document-index.ts'
import type { CollectDocumentRelationGarbageCommandHandlerContract } from '../../../src/DocumentRelations/Application/Contracts/collect-document-relation-garbage.command.handler.contract.ts'
import type { DocumentGarbageCollectionScopeDTO } from '../../../src/Documents/Application/DataTransferObjects/document-garbage-collection-scope.dto.ts'
import type { InspectKnowledgeBaseDocumentRetentionQueryHandlerContract } from '../../../src/KnowledgeBaseDocuments/Application/Contracts/inspect-knowledge-base-document-retention.query.handler.contract.ts'

const retentionCutoff = new Date('2026-01-01T00:00:00.000Z')
const beforeCutoff = new Date('2025-12-31T23:59:59.999Z')

type GarbageCollectionRace = {
  lockReached: Promise<void>
  releaseLock: () => void
  result: Promise<DocumentIndex[]>
  setLockedIndex: (index: DocumentIndex) => void
  addKnowledgeBaseDocumentReference: () => void
  addExecutionLease: () => void
  calls: {
    knowledgeBaseDocumentChecks: number
    executionCounts: number
    failureCounts: number
    relationCollections: number
    chunkCollections: number
    indexDeletes: number
  }
}

const startGarbageCollectionRace = (): GarbageCollectionRace => {
  const candidate = createRestoredDocumentIndexFixture({
    id: 'race-index',
    documentId: 'race-document',
    unreferencedSince: beforeCutoff,
  })
  let lockedIndex = candidate
  let knowledgeBaseDocumentReferenceExists = false
  let executionLeaseExists = false
  let signalLockReached!: () => void
  let releaseLock!: () => void
  const lockReached = new Promise<void>((resolve) => {
    signalLockReached = resolve
  })
  const lockGate = new Promise<void>((resolve) => {
    releaseLock = resolve
  })
  const calls = {
    knowledgeBaseDocumentChecks: 0,
    executionCounts: 0,
    failureCounts: 0,
    relationCollections: 0,
    chunkCollections: 0,
    indexDeletes: 0,
  }

  const documentIndexRepository = createRepositoryStub<DocumentIndexRepository>({
    lockByDocumentIndexId: async () => {
      signalLockReached()
      await lockGate

      return lockedIndex
    },
    deleteByDocumentIndexId: async () => {
      calls.indexDeletes += 1
    },
  })
  const executionQueue = createRepositoryStub<DocumentIndexExecutionQueue>({
    countIndexExecutions: async () => {
      calls.executionCounts += 1

      return executionLeaseExists ? 1 : 0
    },
  })
  const failureArchive = createRepositoryStub<DocumentIndexFailureArchive>({
    countIndexFailures: async () => {
      calls.failureCounts += 1

      return 0
    },
  })
  const knowledgeBaseDocumentRetention =
    createRepositoryStub<InspectKnowledgeBaseDocumentRetentionQueryHandlerContract>({
      execute: async () => {
        calls.knowledgeBaseDocumentChecks += 1

        return knowledgeBaseDocumentReferenceExists ? createRestoredKnowledgeBaseDocumentFixture() : null
      },
    })
  const relationGarbage = createRepositoryStub<CollectDocumentRelationGarbageCommandHandlerContract>({
    execute: async () => {
      calls.relationCollections += 1

      return []
    },
  })
  const chunkGarbage = createRepositoryStub<CollectIndexChunkGarbageCommandHandlerContract>({
    execute: async () => {
      calls.chunkCollections += 1
    },
  })
  const useCase = new CollectDocumentIndexGarbageCommandHandler(
    documentIndexRepository,
    executionQueue,
    failureArchive,
    knowledgeBaseDocumentRetention,
    relationGarbage,
    chunkGarbage,
  )
  const scope: DocumentGarbageCollectionScopeDTO = {
    retentionCutoff,
    lockedDocumentIds: ['race-document'],
  }
  const result = useCase.execute({ scope, candidates: [candidate] })

  return {
    lockReached,
    releaseLock,
    result,
    setLockedIndex: (index) => {
      lockedIndex = index
    },
    addKnowledgeBaseDocumentReference: () => {
      knowledgeBaseDocumentReferenceExists = true
    },
    addExecutionLease: () => {
      executionLeaseExists = true
    },
    calls,
  }
}

test('GC rechecks a newly acquired execution lease after waiting for the index lock', async () => {
  const race = startGarbageCollectionRace()

  await race.lockReached
  race.addExecutionLease()
  race.releaseLock()

  assert.deepEqual(await race.result, [])
  assert.equal(race.calls.executionCounts, 1)
  assert.equal(race.calls.failureCounts, 1)
  assert.equal(race.calls.relationCollections, 0)
  assert.equal(race.calls.chunkCollections, 0)
  assert.equal(race.calls.indexDeletes, 0)
})

test('GC rechecks a knowledgeBaseDocument reference added while it waits for the index lock', async () => {
  const race = startGarbageCollectionRace()

  await race.lockReached
  race.addKnowledgeBaseDocumentReference()
  race.releaseLock()

  assert.deepEqual(await race.result, [])
  assert.equal(race.calls.knowledgeBaseDocumentChecks, 1)
  assert.equal(race.calls.executionCounts, 1)
  assert.equal(race.calls.failureCounts, 1)
  assert.equal(race.calls.relationCollections, 0)
  assert.equal(race.calls.chunkCollections, 0)
  assert.equal(race.calls.indexDeletes, 0)
})

test('GC applies the original cutoff to the row returned after its lock wait', async () => {
  const race = startGarbageCollectionRace()

  await race.lockReached
  race.setLockedIndex(
    createRestoredDocumentIndexFixture({
      id: 'race-index',
      documentId: 'race-document',
      unreferencedSince: new Date(retentionCutoff.getTime() + 1),
    }),
  )
  race.releaseLock()

  assert.deepEqual(await race.result, [])
  assert.equal(race.calls.knowledgeBaseDocumentChecks, 0)
  assert.equal(race.calls.executionCounts, 0)
  assert.equal(race.calls.failureCounts, 0)
  assert.equal(race.calls.relationCollections, 0)
  assert.equal(race.calls.chunkCollections, 0)
  assert.equal(race.calls.indexDeletes, 0)
})
