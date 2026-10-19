import assert from 'node:assert/strict'
import test from 'node:test'

import { createDocumentFixture, createRepositoryStub } from './document-index-lifecycle.fixture.ts'
import {
  createGarbageCollectionListener,
  type GarbageCollectionTestDependencies,
} from './document-retention-use-cases.fixture.ts'
import { DocumentGarbageCollectionRequestedEvent } from '../../../src/Application/Documents/Events/document-garbage-collection-requested.event.ts'
import { InspectDocumentRetentionUseCase } from '../../../src/Application/Documents/UseCases/inspect-document-retention.use-case.ts'

test('document retention checks technical references even when every business reference is absent', async (context) => {
  const document = createDocumentFixture()
  await Promise.all(
    [
      { executions: 1, failures: 0, protected: true },
      { executions: 0, failures: 1, protected: true },
      { executions: 0, failures: 0, protected: false },
    ].map((scenario) =>
      context.test(`executions=${scenario.executions}, failures=${scenario.failures}`, async () => {
        const useCase = new InspectDocumentRetentionUseCase(
          { execute: async () => null },
          { execute: async () => null },
          { execute: async () => null },
          { execute: async () => null },
          createRepositoryStub<GarbageCollectionTestDependencies[1]>({ findByDocumentId: async () => document }),
          createRepositoryStub<GarbageCollectionTestDependencies[3]>({
            countDocumentExecutions: async ({ documentId }) => {
              assert.equal(documentId, document.id)

              return scenario.executions
            },
          }),
          createRepositoryStub<GarbageCollectionTestDependencies[6]>({
            countDocumentFailures: async ({ documentId }) => {
              assert.equal(documentId, document.id)

              return scenario.failures
            },
          }),
        )

        assert.equal(await useCase.execute({ documentId: document.id }), scenario.protected ? document : null)
      }),
    ),
  )
})

test('garbage collection locks a failure-only parent before removing its last failure and starting retention', async () => {
  const calls: string[] = []
  const document = createDocumentFixture()
  const failure = { failedJobId: 'failure', documentId: document.id, failedAt: new Date('2020-01-01') }
  let failureCount = 1
  const listener = createGarbageCollectionListener(
    { run: async (work) => work(), runReadOnlySnapshot: async (work) => work() },
    createRepositoryStub<GarbageCollectionTestDependencies[1]>({
      findByUnreferencedSinceLessThanOrEqual: async () => [],
      lockByDocumentId: async ({ documentId }) => {
        calls.push(`lock-parent:${documentId}`)

        return document
      },
      updateUnreferencedSinceByDocumentIdAndUnreferencedSinceIsNull: async () => {
        calls.push('start-retention')
      },
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[2]>({ findByDocumentId: async () => null }),
    createRepositoryStub<GarbageCollectionTestDependencies[3]>({
      countFailureRetries: async () => 0,
      countDocumentExecutions: async () => 0,
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[4]>({
      findByUnreferencedSinceLessThanOrEqualOrderByIdAsc: async () => [],
      findByDocumentId: async () => [],
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[5]>({
      findByCreatedAtLessThanOrEqual: async () => [],
      findByDocumentIdOrderByCreatedAtDesc: async () => null,
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[6]>({
      findExpiredFailures: async () => [failure],
      lockExpiredFailure: async () => {
        calls.push('lock-failure')

        return failure
      },
      removeExpiredFailure: async () => {
        calls.push('remove-failure')
        failureCount = 0
      },
      countDocumentFailures: async () => failureCount,
    }),
    createRepositoryStub<GarbageCollectionTestDependencies[7]>({}),
    createRepositoryStub<GarbageCollectionTestDependencies[8]>({
      findBySourceIndexIdsOrderByIdAsc: async () => [],
      findByTargetDocumentId: async () => null,
    }),
    { gcRetentionMs: 60_000 },
  )

  await listener.handle(new DocumentGarbageCollectionRequestedEvent(new Date('2026-10-18T00:00:00.000Z')))

  assert.deepEqual(calls, [
    `lock-parent:${document.id}`,
    'lock-failure',
    'remove-failure',
    `lock-parent:${document.id}`,
    'start-retention',
  ])
})
