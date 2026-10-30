import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LEXICAL_PROFILE_VERSION,
  LexicalSearchQueryAdapter,
} from '../../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Adapters/lexical-search-query.adapter.ts'
import { InvalidLexicalSearchTermException } from '../../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Exceptions/invalid-lexical-search-term.exception.ts'

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
  assert.equal(formatter.formatSearchVector(representation.terms), "'architecture':1 'boundaries':2")
  assert.deepEqual(formatter.format('ARCHITECTURE BOUNDARIES'), representation)
  assert.notDeepEqual(formatter.format('boundaries Architecture').terms, representation.terms)
})

test('lexical search formatting segments Traditional Chinese and mixed English', () => {
  const representation = new LexicalSearchQueryAdapter().format('繁體中文 Hybrid 檢索')

  assert.deepEqual(representation.terms, ['繁體', '中文', 'hybrid', '檢索'])
  assert.equal(representation.searchText, '繁體 中文 hybrid 檢索')
  assert.equal(
    new LexicalSearchQueryAdapter().formatSearchVector(representation.terms),
    "'繁體':1 '中文':2 'hybrid':3 '檢索':4",
  )
})

test('lexical search formatting produces an empty representation for text without words', () => {
  const formatter = new LexicalSearchQueryAdapter()

  const testCases = ['', '   \n\t', '，。！？ --']
  testCases.forEach((text) => {
    const representation = formatter.format(text)

    assert.deepEqual(representation.terms, [])
    assert.equal(representation.searchText, '')
    assert.equal(formatter.formatSearchVector(representation.terms), '')
    assert.equal(representation.profileVersion, LEXICAL_PROFILE_VERSION)
  })
})

test('lexical query formatting does not apply persisted tsvector lexeme limits', () => {
  const longLexeme = 'x'.repeat(2048)
  const representation = new LexicalSearchQueryAdapter().format(longLexeme)

  assert.deepEqual(representation.terms, [longLexeme])
  assert.equal(representation.searchText, longLexeme)
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

test('lexical vector formatting preserves repeated terms and their source token positions', () => {
  const formatter = new LexicalSearchQueryAdapter()
  const representation = formatter.format('Hybrid retrieval hybrid')

  assert.deepEqual(representation.terms, ['hybrid', 'retrieval', 'hybrid'])
  assert.equal(representation.searchText, 'hybrid retrieval hybrid')
  assert.equal(formatter.formatSearchVector(representation.terms), "'hybrid':1,3 'retrieval':2")
})

test('lexical vector formatting escapes PostgreSQL tsvector quotes and backslashes', () => {
  const searchVectorText = new LexicalSearchQueryAdapter().formatSearchVector(["o'reilly\\collection"])

  assert.equal(searchVectorText, "'o''reilly\\\\collection':1")
})

test('lexical vector formatting saturates source positions and caps positions per lexeme', () => {
  const formatter = new LexicalSearchQueryAdapter()
  const terms = Array.from({ length: 16384 }, (_, index) => `term${index}`)
  const saturated = formatter.formatSearchVector(terms)
  const repeated = formatter.formatSearchVector(Array<string>(257).fill('echo'))

  assert.ok(saturated.endsWith("'term16383':16383"))
  assert.ok(saturated.includes("'term16382':16383"))
  assert.equal(repeated, `'echo':${Array.from({ length: 256 }, (_, index) => index + 1).join(',')}`)
})

test('lexical vector formatting enforces PostgreSQL UTF-8 lexeme byte bounds', () => {
  const formatter = new LexicalSearchQueryAdapter()
  const maximumLengthTerm = `${'界'.repeat(682)}x`
  const exceedingLengthTerm = `${'界'.repeat(682)}xx`

  assert.equal(new TextEncoder().encode(maximumLengthTerm).length, 2047)
  assert.equal(new TextEncoder().encode(exceedingLengthTerm).length, 2048)
  assert.ok(formatter.formatSearchVector([maximumLengthTerm]).endsWith(':1'))
  assert.throws(() => formatter.formatSearchVector([exceedingLengthTerm]), {
    name: 'LexicalSearchTermTooLongException',
    code: 'LEXICAL_SEARCH_TERM_TOO_LONG',
    message: 'A lexical search vector term cannot exceed 2047 UTF-8 bytes.',
  })
  assert.throws(() => formatter.formatSearchVector(['']), InvalidLexicalSearchTermException)
  assert.throws(() => formatter.formatSearchVector(['invalid\u0000term']), InvalidLexicalSearchTermException)
})
