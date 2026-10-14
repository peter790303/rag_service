import assert from 'node:assert/strict'
import test from 'node:test'

import { RagLexicalQuery } from '../../../src/Domain/Knowledge/ValueObjects/rag-lexical-query.js'

test('lexical query terms are exposed as an immutable snapshot', () => {
  const query = RagLexicalQuery.fromText('Architecture boundaries')
  const searchText = query.toSearchText()

  assert.ok(Object.isFrozen(query.terms))
  assert.throws(() => (query.terms as string[]).push('injected'), TypeError)
  assert.equal(query.toSearchText(), searchText)
})

test('lexical query equality compares normalized ordered terms', () => {
  const query = RagLexicalQuery.fromText('Architecture boundaries')

  assert.equal(query.equals(RagLexicalQuery.fromText('ARCHITECTURE BOUNDARIES')), true)
  assert.equal(query.equals(RagLexicalQuery.fromText('boundaries Architecture')), false)
})
