import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateRagPipelineHash } from '../../../src/Domain/Knowledge/ValueObjects/rag-pipeline-hash.js'

const base = {
  contentSha256: 'a'.repeat(64),
  embeddingModel: 'embedding-v1',
  embeddingDimensions: 384,
  chunkingModel: 'chunk-v1',
}

test('pipeline hash includes output context and ignores JSON object key order', () => {
  const first = calculateRagPipelineHash({
    ...base,
    context: { projectPrompt: 'A', options: { z: true, a: 2 } },
  })
  const same = calculateRagPipelineHash({
    ...base,
    context: { options: { a: 2, z: true }, projectPrompt: 'A' },
  })
  const changed = calculateRagPipelineHash({
    ...base,
    context: { options: { a: 2, z: true }, projectPrompt: 'B' },
  })

  assert.equal(first, same)
  assert.notEqual(first, changed)
})
