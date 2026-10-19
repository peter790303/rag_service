import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { CHUNKING_PROFILE_VERSION, RELATION_PROFILE_VERSION } from '../../../config/chunk-planning-profile.config.ts'
import {
  type DocumentIndexPipelineHashSource,
  type DocumentIndexPipelineSettings,
  WriteRequestDocumentIndexesAssembler,
} from '../../../src/Application/DocumentIndexes/Assemblers/write-request-document-indexes.assembler.ts'
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

const pipelineIdentityChanges: {
  name: string
  settings: Partial<DocumentIndexPipelineSettings>
  source: Partial<DocumentIndexPipelineHashSource>
}[] = [
  { name: 'content digest', settings: {}, source: { contentSha256: 'b'.repeat(64) } },
  { name: 'embedding model', settings: {}, source: { embeddingModel: 'embedding-v2' } },
  { name: 'embedding dimensions', settings: {}, source: { embeddingDimensions: 768 } },
  { name: 'chunking model', settings: {}, source: { chunkingModel: 'chunk-v2' } },
  { name: 'embedding profile', settings: { embeddingProfile: 'embedding-profile-v2' }, source: {} },
  { name: 'chunking profile', settings: { chunkingProfile: 'chunking-profile-v2' }, source: {} },
  { name: 'lexical profile', settings: { lexicalProfile: 'lexical-profile-v2' }, source: {} },
  { name: 'relation profile', settings: { relationProfile: 'relation-profile-v2' }, source: {} },
]

pipelineIdentityChanges.forEach(({ name, settings, source }) => {
  test(`changing the ${name} produces a distinct pipeline identity`, () => {
    const baselineSettings: DocumentIndexPipelineSettings = {
      ...documentIndexRequestFactsFixture,
      embeddingProfile: 'mean-pooling-normalized:384',
      chunkingProfile: CHUNKING_PROFILE_VERSION,
      lexicalProfile: LEXICAL_PROFILE_VERSION,
      relationProfile: RELATION_PROFILE_VERSION,
    }
    const baselineAssembler = new WriteRequestDocumentIndexesAssembler(baselineSettings)
    const changedAssembler = new WriteRequestDocumentIndexesAssembler({ ...baselineSettings, ...settings })
    const baselineHash = createHash('sha256')
      .update(baselineAssembler.serializeDocumentIndexPipelineHashInput(documentIndexRequestFactsFixture))
      .digest('hex')
    const changedHash = createHash('sha256')
      .update(
        changedAssembler.serializeDocumentIndexPipelineHashInput({ ...documentIndexRequestFactsFixture, ...source }),
      )
      .digest('hex')

    assert.notEqual(changedHash, baselineHash)
  })
})
