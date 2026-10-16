import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LEXICAL_PROFILE_VERSION,
  LexicalSearchQueryAdapter,
} from '../../../../src/Infrastructure/Persistence/Adapters/lexical-search-query.adapter.ts'

test('lexical search representation preserves the persisted profile version', () => {
  const representation = new LexicalSearchQueryAdapter().format('Architecture boundaries')

  assert.equal(LEXICAL_PROFILE_VERSION, 'zh-hant-segmenter-v1')
  assert.equal(representation.profileVersion, LEXICAL_PROFILE_VERSION)
})

test('lexical search formatting normalizes English and preserves ordered terms', () => {
  const formatter = new LexicalSearchQueryAdapter()
  const representation = formatter.format('Architecture boundaries')

  assert.deepEqual(representation.terms, ['architecture', 'boundaries'])
  assert.equal(representation.searchText, 'architecture boundaries')
  assert.deepEqual(formatter.format('ARCHITECTURE BOUNDARIES'), representation)
  assert.notDeepEqual(formatter.format('boundaries Architecture').terms, representation.terms)
})

test('lexical search formatting segments Traditional Chinese and mixed English', () => {
  const representation = new LexicalSearchQueryAdapter().format('繁體中文 Hybrid 檢索')

  assert.deepEqual(representation.terms, ['繁體', '中文', 'hybrid', '檢索'])
  assert.equal(representation.searchText, '繁體 中文 hybrid 檢索')
})

test('lexical search formatting produces an empty representation for text without words', () => {
  const formatter = new LexicalSearchQueryAdapter()

  for (const text of ['', '   \n\t', '，。！？ --']) {
    const representation = formatter.format(text)

    assert.deepEqual(representation.terms, [])
    assert.equal(representation.searchText, '')
    assert.equal(representation.profileVersion, LEXICAL_PROFILE_VERSION)
  }
})

test('lexical search terms are immutable independent snapshots', () => {
  const formatter = new LexicalSearchQueryAdapter()
  const representation = formatter.format('Architecture boundaries')
  const subsequentRepresentation = formatter.format('Different terms')

  assert.ok(Object.isFrozen(representation.terms))
  assert.throws(() => (representation.terms as string[]).push('injected'), TypeError)
  assert.notEqual(representation.terms, subsequentRepresentation.terms)
  assert.deepEqual(representation.terms, ['architecture', 'boundaries'])
  assert.equal(representation.searchText, 'architecture boundaries')
})
