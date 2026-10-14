import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { RagIndexRequestAssembler } from '../../../src/Application/KnowledgeBases/Assemblers/rag-index-request.assembler.js'
import { MarkdownChunkFactory } from '../../../src/Domain/Knowledge/markdown-chunk.factory.js'
import { LEXICAL_PROFILE_VERSION } from '../../../src/Domain/Knowledge/ValueObjects/rag-lexical-query.js'

const base = {
  contentSha256: 'a'.repeat(64),
  embeddingModel: 'embedding-v1',
  embeddingDimensions: 384,
  chunkingModel: 'chunk-v1',
}
const assembler = new RagIndexRequestAssembler({
  embeddingProfile: 'mean-pooling-normalized:384',
  chunkingProfile: MarkdownChunkFactory.chunkingProfile,
  lexicalProfile: LEXICAL_PROFILE_VERSION,
  relationProfile: MarkdownChunkFactory.relationProfile,
  ...base,
})

test('pipeline hash serialization preserves the digest and ignores JSON object key order', () => {
  const first = createHash('sha256')
    .update(
      assembler.serializePipelineHashInput({
        ...base,
        context: { projectPrompt: 'A', options: { z: true, a: 2 } },
      }),
    )
    .digest('hex')
  const same = createHash('sha256')
    .update(
      assembler.serializePipelineHashInput({
        ...base,
        context: { options: { a: 2, z: true }, projectPrompt: 'A' },
      }),
    )
    .digest('hex')
  const changed = createHash('sha256')
    .update(
      assembler.serializePipelineHashInput({
        ...base,
        context: { options: { a: 2, z: true }, projectPrompt: 'B' },
      }),
    )
    .digest('hex')

  assert.equal(first, '88509fe7b05824ed58dd248bd7463ef53d03b72c3cfaa8ab49d86ac6e0ae5926')
  assert.equal(first, same)
  assert.notEqual(first, changed)
})
