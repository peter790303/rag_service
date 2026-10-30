import assert from 'node:assert/strict'
import test from 'node:test'

import { createRepositoryStub } from './document-index-lifecycle.fixture.ts'
import { PrepareDocumentRevisionForIndexRequestCommandHandler } from '../../../src/DocumentRevisions/Application/Commands/prepare-document-revision-for-index-request.command.handler.ts'
import type { DocumentRevisionSourceSnapshotDTO } from '../../../src/DocumentRevisions/Application/DTOs/prepare-document-revision-for-index-request.dto.ts'
import { InvalidDocumentRevisionIndexRequestInputException } from '../../../src/DocumentRevisions/Application/Exceptions/invalid-document-revision-index-request-input.exception.ts'
import type { DocumentRevisionRepository } from '../../../src/DocumentRevisions/Application/Ports/Out/Repositories/document-revision.repository.ts'
import type { CreateDocumentRevisionQO } from '../../../src/DocumentRevisions/Application/QueryObjects/document-revision.query-object.ts'
import { DocumentRevision } from '../../../src/DocumentRevisions/Domain/Entities/document-revision.ts'
import { InvalidDocumentRevisionHashException } from '../../../src/DocumentRevisions/Domain/Exceptions/invalid-document-revision-hash.exception.ts'
import { InvalidDocumentRevisionIdentityException } from '../../../src/DocumentRevisions/Domain/Exceptions/invalid-document-revision-identity.exception.ts'

const sourceDocument: DocumentRevisionSourceSnapshotDTO = {
  content: '',
}
const validInput = { sourceDocument, documentId: 'document-1', contentSha256: 'a'.repeat(64) }
type PrepareRevisionInput = Parameters<PrepareDocumentRevisionForIndexRequestCommandHandler['execute']>[0]

test('revision input omissions and invalid values fail before any repository call', async (context) => {
  const scenarios = [
    { name: 'missing input', input: undefined, exception: InvalidDocumentRevisionIndexRequestInputException },
    {
      name: 'missing source',
      input: { ...validInput, sourceDocument: undefined },
      exception: InvalidDocumentRevisionIndexRequestInputException,
    },
    {
      name: 'missing document id',
      input: { ...validInput, documentId: undefined },
      exception: InvalidDocumentRevisionIndexRequestInputException,
    },
    {
      name: 'document id with invalid type',
      input: { ...validInput, documentId: 42 },
      exception: InvalidDocumentRevisionIndexRequestInputException,
    },
    {
      name: 'empty document id violates the domain invariant',
      input: { ...validInput, documentId: '' },
      exception: InvalidDocumentRevisionIdentityException,
    },
    {
      name: 'missing hash',
      input: { ...validInput, contentSha256: undefined },
      exception: InvalidDocumentRevisionIndexRequestInputException,
    },
    {
      name: 'hash with invalid type',
      input: { ...validInput, contentSha256: 42 },
      exception: InvalidDocumentRevisionIndexRequestInputException,
    },
    {
      name: 'invalid hash',
      input: { ...validInput, contentSha256: 'not-a-hash' },
      exception: InvalidDocumentRevisionHashException,
    },
    {
      name: 'missing content',
      input: { ...validInput, sourceDocument: { ...sourceDocument, content: undefined } },
      exception: InvalidDocumentRevisionIndexRequestInputException,
    },
    {
      name: 'content with invalid type',
      input: { ...validInput, sourceDocument: { ...sourceDocument, content: 42 } },
      exception: InvalidDocumentRevisionIndexRequestInputException,
    },
    {
      name: 'invalid title',
      input: { ...validInput, sourceDocument: { ...sourceDocument, title: false } },
      exception: InvalidDocumentRevisionIndexRequestInputException,
    },
  ]

  await Promise.all(
    scenarios.map(({ name, input, exception }) =>
      context.test(name, async () => {
        const useCase = new PrepareDocumentRevisionForIndexRequestCommandHandler(
          createRepositoryStub<DocumentRevisionRepository>({
            findByDocumentIdAndContentSha256: async () => assert.fail('invalid revision must not reach persistence'),
            create: async () => assert.fail('invalid revision must not be written'),
          }),
        )
        await assert.rejects(useCase.execute(input as PrepareRevisionInput), exception)
      }),
    ),
  )
})

test('revision creation supplies validated identity and timestamps while preserving empty content and optional title', async (context) => {
  await Promise.all(
    [undefined, null, ''].map((title) =>
      context.test(`title ${String(title)}`, async () => {
        const writes: CreateDocumentRevisionQO[] = []
        const useCase = new PrepareDocumentRevisionForIndexRequestCommandHandler(
          createRepositoryStub<DocumentRevisionRepository>({
            findByDocumentIdAndContentSha256: async () => null,
            create: async (query) => {
              writes.push(query)
            },
          }),
        )
        const source = title === undefined ? sourceDocument : { ...sourceDocument, title }
        const revision = await useCase.execute({ ...validInput, sourceDocument: source })

        assert.equal(writes.length, 1)
        assert.match(revision.id, /^[0-9a-f-]{36}$/)
        assert.equal(revision.title, title === undefined ? null : title)
        assert.equal(revision.content, '')
        assert.ok(Number.isFinite(revision.capturedAt.epochMilliseconds))
        assert.equal(revision.createdAt.equals(revision.capturedAt), true)
        assert.equal(writes[0]?.id, revision.id)
      }),
    ),
  )
})

test('an existing revision is returned unchanged without writing a fresh capture', async () => {
  const existingRevision = new DocumentRevision({
    id: 'existing-revision',
    documentId: validInput.documentId,
    contentSha256: validInput.contentSha256,
    title: 'Captured title',
    content: sourceDocument.content,
    capturedAt: new Date('2026-10-01T00:00:00Z'),
    createdAt: new Date('2026-10-01T00:00:00Z'),
  })
  const useCase = new PrepareDocumentRevisionForIndexRequestCommandHandler(
    createRepositoryStub<DocumentRevisionRepository>({
      findByDocumentIdAndContentSha256: async () => existingRevision,
      create: async () => assert.fail('existing content revision must not be recreated'),
    }),
  )

  assert.equal(await useCase.execute(validInput), existingRevision)
})
