import assert from 'node:assert/strict'
import test from 'node:test'

import type { RagConfig } from '../../../config/rag.config.js'
import { RagWorker } from '../../../src/Interfaces/Console/Workers/rag-worker.js'

test('continues polling after rejected background executions', { timeout: 1000 }, async () => {
  let indexExecutions = 0
  let garbageCollections = 0
  const worker = new RagWorker(
    {
      execute: async () => {
        garbageCollections += 1

        if (garbageCollections === 1) throw new Error('database unavailable')

        return garbageCollections
      },
    },
    {
      execute: async () => {
        indexExecutions += 1

        if (indexExecutions === 1) throw new Error('database unavailable')
      },
    },
    { workerPollMs: 5, gcPollMs: 5 } satisfies Pick<RagConfig, 'workerPollMs' | 'gcPollMs'>,
  )

  worker.onModuleInit()
  await new Promise((resolve) => setTimeout(resolve, 30))
  worker.onModuleDestroy()

  assert.ok(indexExecutions > 1, 'index processing should continue after a rejected execution')
  assert.ok(garbageCollections > 1, 'garbage collection should continue after a rejected execution')
})
