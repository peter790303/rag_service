import assert from 'node:assert/strict'
import test from 'node:test'

import { InvalidDocumentReferenceException } from '../../../../src/Domain/DocumentRelation/Exceptions/invalid-document-reference.exception.ts'
import { DocumentReference } from '../../../../src/Domain/DocumentRelation/ValueObjects/document-reference.ts'

test('document reference equality uses its normalized path and anchor value', () => {
  const reference = new DocumentReference('Notes\\Guides\\../Setup.MD?view=compact', 'Heading%20One')
  const equivalent = new DocumentReference('notes/setup', 'heading_one')

  assert.equal(Object.isFrozen(reference), true)
  assert.equal(reference.equals(equivalent), true)
  assert.equal(reference.refersToSameDocument(new DocumentReference('NOTES/setup.md', 'Other')), true)
  assert.equal(reference.path, 'notes/setup')
  assert.equal(reference.anchor, 'Heading%20One')
})

test('document reference validates required paths and matches canonical heading anchors', () => {
  assert.throws(() => new DocumentReference('  '), InvalidDocumentReferenceException)
  assert.equal(DocumentReference.tryCreate(undefined), null)

  const reference = new DocumentReference('notes/setup.md', 'Heading%20One')

  assert.equal(reference.matchesHeadingPath(['Introduction', 'Heading_One']), true)
  assert.equal(reference.matchesHeadingPath(['Different heading']), false)
  assert.equal(new DocumentReference('notes/setup.md').matchesHeadingPath([]), true)
})

test('fragment references preserve canonical anchor equality and reject external locations', () => {
  const reference = new DocumentReference('Notes/Setup.md#Heading%20One|display alias')
  assert.equal(reference.equals(new DocumentReference('notes/setup', 'heading_one')), true)
  assert.equal(reference.matchesHeadingPath(['Heading One']), true)
  assert.equal(DocumentReference.tryCreate('https://example.com/notes/setup.md'), null)
  assert.throws(() => new DocumentReference('mailto:setup@example.com'), InvalidDocumentReferenceException)
  assert.equal(Reflect.set(reference, 'path', 'changed'), false)
})
