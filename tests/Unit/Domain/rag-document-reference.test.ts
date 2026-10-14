import assert from 'node:assert/strict'
import test from 'node:test'

import { RagDocumentReference } from '../../../src/Domain/Knowledge/ValueObjects/rag-document-reference.js'

test('document reference equality uses its normalized path and anchor value', () => {
  const reference = new RagDocumentReference('Notes\\Guides\\../Setup.MD?view=compact', 'Heading%20One')
  const equivalent = new RagDocumentReference('notes/setup', 'heading_one')

  assert.equal(Object.isFrozen(reference), true)
  assert.equal(reference.equals(equivalent), true)
  assert.equal(reference.refersToSameDocument(new RagDocumentReference('NOTES/setup.md', 'Other')), true)
  assert.equal(reference.path, 'notes/setup')
  assert.equal(reference.anchor, 'Heading%20One')
})

test('document reference validates required paths and matches canonical heading anchors', () => {
  assert.throws(() => new RagDocumentReference('  '), TypeError)
  assert.equal(RagDocumentReference.tryCreate(undefined), null)

  const reference = new RagDocumentReference('notes/setup.md', 'Heading%20One')

  assert.equal(reference.matchesHeadingPath(['Introduction', 'Heading_One']), true)
  assert.equal(reference.matchesHeadingPath(['Different heading']), false)
  assert.equal(new RagDocumentReference('notes/setup.md').matchesHeadingPath([]), true)
})

test('fragment references preserve canonical anchor equality and reject external locations', () => {
  const reference = new RagDocumentReference('Notes/Setup.md#Heading%20One|display alias')
  assert.equal(reference.equals(new RagDocumentReference('notes/setup', 'heading_one')), true)
  assert.equal(reference.matchesHeadingPath(['Heading One']), true)
  assert.equal(RagDocumentReference.tryCreate('https://example.com/notes/setup.md'), null)
  assert.throws(() => new RagDocumentReference('mailto:setup@example.com'), TypeError)
  assert.equal(Reflect.set(reference, 'path', 'changed'), false)
})
