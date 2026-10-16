import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { CHUNKING_PROFILE_VERSION, RELATION_PROFILE_VERSION } from '../../../config/chunk-planning-profile.config.ts'
import { WriteRequestDocumentIndexesAssembler } from '../../../src/Application/DocumentIndexes/Assemblers/write-request-document-indexes.assembler.ts'
import { LEXICAL_PROFILE_VERSION } from '../../../src/Infrastructure/Persistence/Adapters/lexical-search-query.adapter.ts'

const documentIndexRequestFactsFixture = {
  contentSha256: 'a'.repeat(64),
  embeddingModel: 'embedding-v1',
  embeddingDimensions: 384,
  chunkingModel: 'chunk-v1',
}
const writeRequestDocumentIndexesAssembler = new WriteRequestDocumentIndexesAssembler({
  embeddingProfile: 'mean-pooling-normalized:384',
  chunkingProfile: CHUNKING_PROFILE_VERSION,
  lexicalProfile: LEXICAL_PROFILE_VERSION,
  relationProfile: RELATION_PROFILE_VERSION,
  ...documentIndexRequestFactsFixture,
})

test('pipeline hash serialization preserves the digest and ignores JSON object key order', () => {
  const first = createHash('sha256')
    .update(
      writeRequestDocumentIndexesAssembler.serializeDocumentIndexPipelineHashInput({
        ...documentIndexRequestFactsFixture,
        context: { projectPrompt: 'A', options: { z: true, a: 2 } },
      }),
    )
    .digest('hex')
  const same = createHash('sha256')
    .update(
      writeRequestDocumentIndexesAssembler.serializeDocumentIndexPipelineHashInput({
        ...documentIndexRequestFactsFixture,
        context: { options: { a: 2, z: true }, projectPrompt: 'A' },
      }),
    )
    .digest('hex')
  const changed = createHash('sha256')
    .update(
      writeRequestDocumentIndexesAssembler.serializeDocumentIndexPipelineHashInput({
        ...documentIndexRequestFactsFixture,
        context: { options: { a: 2, z: true }, projectPrompt: 'B' },
      }),
    )
    .digest('hex')

  assert.equal(first, '88509fe7b05824ed58dd248bd7463ef53d03b72c3cfaa8ab49d86ac6e0ae5926')
  assert.equal(first, same)
  assert.notEqual(first, changed)
})
