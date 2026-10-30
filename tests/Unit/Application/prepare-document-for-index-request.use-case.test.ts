import assert from 'node:assert/strict'
import test from 'node:test'

import { PrepareDocumentForIndexRequestCommandHandler } from '../../../src/Documents/Application/Commands/prepare-document-for-index-request.command.handler.ts'
import type { SourceDocumentDTO } from '../../../src/Documents/Application/DTOs/source-document.dto.ts'
import { IndexRequestDocumentUnavailableException } from '../../../src/Documents/Application/Exceptions/index-request-document-unavailable.exception.ts'
import { InvalidDocumentSourceInputException } from '../../../src/Documents/Application/Exceptions/invalid-document-source-input.exception.ts'
import type { DocumentRepository } from '../../../src/Documents/Application/Ports/Out/Repositories/document.repository.ts'
import { Document } from '../../../src/Documents/Domain/Entities/document.ts'
import { DocumentSourceTypeEnum } from '../../../src/Documents/Domain/Enums/document-source-type.enum.ts'
import { InvalidDocumentSourceException } from '../../../src/Documents/Domain/Exceptions/invalid-document-source.exception.ts'

const sourceDocument: SourceDocumentDTO = {
  knowledgeBaseId: 'kb-1',
  projectId: 'project-1',
  projectName: 'Project',
  sourceType: DocumentSourceTypeEnum.REPOSITORY,
  sourceKey: 'repo',
  sourcePath: 'page.md',
  content: 'content',
}

test('source identity and title are validated before any document repository access', async (context) => {
  const access = context.mock.fn(async () => {
    throw new Error('repository must not be accessed')
  })
  const repository = {
    upsertBySourceTypeAndSourceKeyAndSourcePath: access,
    upsertTitleBySourceTypeAndSourceKeyAndSourcePath: access,
    findBySourceTypeAndSourceKeyAndSourcePath: access,
    lockByDocumentId: access,
  } as unknown as DocumentRepository
  const useCase = new PrepareDocumentForIndexRequestCommandHandler(repository)

  await Promise.all(
    ['sourceType', 'sourceKey', 'sourcePath'].map(async (field) => {
      await assert.rejects(
        useCase.execute({ ...sourceDocument, [field]: undefined } as unknown as SourceDocumentDTO),
        (error: unknown) => error instanceof InvalidDocumentSourceInputException && error.field === field,
      )
    }),
  )
  await Promise.all(
    ['sourceType', 'sourceKey', 'sourcePath', 'title'].map(async (field) => {
      await assert.rejects(
        useCase.execute({ ...sourceDocument, [field]: false } as unknown as SourceDocumentDTO),
        (error: unknown) => error instanceof InvalidDocumentSourceInputException && error.field === field,
      )
    }),
  )
  await assert.rejects(
    useCase.execute({ ...sourceDocument, sourceType: 'other' } as unknown as SourceDocumentDTO),
    InvalidDocumentSourceException,
  )
  await assert.rejects(useCase.execute({ ...sourceDocument, sourceKey: '  ' }), InvalidDocumentSourceException)
  await assert.rejects(useCase.execute(undefined as unknown as SourceDocumentDTO), InvalidDocumentSourceInputException)
  await assert.rejects(useCase.execute(null as unknown as SourceDocumentDTO), InvalidDocumentSourceInputException)
  assert.equal(access.mock.callCount(), 0)
})

test('omitted, null, empty and supplied titles select explicit persistence operations', async (context) => {
  const document = new Document({
    id: 'document-1',
    sourceType: sourceDocument.sourceType,
    sourceKey: sourceDocument.sourceKey,
    sourcePath: sourceDocument.sourcePath,
    currentTitle: 'existing title',
    createdAt: new Date(0),
    unreferencedSince: null,
  })
  const preserve = context.mock.fn<DocumentRepository['upsertBySourceTypeAndSourceKeyAndSourcePath']>(async () => {})
  const replace = context.mock.fn<DocumentRepository['upsertTitleBySourceTypeAndSourceKeyAndSourcePath']>(
    async () => {},
  )
  const find = context.mock.fn<DocumentRepository['findBySourceTypeAndSourceKeyAndSourcePath']>(async () => document)
  const lock = context.mock.fn<DocumentRepository['lockByDocumentId']>(async () => document)
  const useCase = new PrepareDocumentForIndexRequestCommandHandler({
    upsertBySourceTypeAndSourceKeyAndSourcePath: preserve,
    upsertTitleBySourceTypeAndSourceKeyAndSourcePath: replace,
    findBySourceTypeAndSourceKeyAndSourcePath: find,
    lockByDocumentId: lock,
  } as unknown as DocumentRepository)
  const expectedSource = {
    sourceType: sourceDocument.sourceType,
    sourceKey: sourceDocument.sourceKey,
    sourcePath: sourceDocument.sourcePath,
    unreferencedSince: null,
  }

  assert.equal(await useCase.execute(sourceDocument), document)
  const candidate = preserve.mock.calls[0]?.arguments[0]
  assert.ok(candidate)
  assert.match(candidate.id, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
  assert.ok(Number.isFinite(candidate.createdAt.getTime()))
  assert.deepEqual(candidate, { ...expectedSource, id: candidate.id, createdAt: candidate.createdAt })
  assert.equal(replace.mock.callCount(), 0)
  await useCase.execute({ ...sourceDocument, title: null })
  await useCase.execute({ ...sourceDocument, title: '' })
  await useCase.execute({ ...sourceDocument, title: 'new title' })
  assert.deepEqual(
    replace.mock.calls.map((call) => {
      const { id, createdAt, ...state } = call.arguments[0]
      assert.notEqual(id, candidate.id)
      assert.ok(Number.isFinite(createdAt.getTime()))

      return [state]
    }),
    [
      [{ ...expectedSource, currentTitle: null }],
      [{ ...expectedSource, currentTitle: '' }],
      [{ ...expectedSource, currentTitle: 'new title' }],
    ],
  )
  assert.equal(preserve.mock.callCount(), 1)
  assert.equal(find.mock.callCount(), 4)
  assert.deepEqual(find.mock.calls[0]?.arguments, [
    {
      sourceType: sourceDocument.sourceType,
      sourceKey: sourceDocument.sourceKey,
      sourcePath: sourceDocument.sourcePath,
    },
  ])
  assert.deepEqual(lock.mock.calls[0]?.arguments, [{ documentId: document.id }])
  assert.equal(lock.mock.callCount(), 4)
})

test('missing source after the write fails before locking a candidate document ID', async (context) => {
  const events: string[] = []
  const lock = context.mock.fn(async () => null)
  const useCase = new PrepareDocumentForIndexRequestCommandHandler({
    upsertBySourceTypeAndSourceKeyAndSourcePath: async () => {
      events.push('write')
    },
    findBySourceTypeAndSourceKeyAndSourcePath: async () => {
      events.push('read')

      return null
    },
    lockByDocumentId: lock,
  } as unknown as DocumentRepository)

  await assert.rejects(useCase.execute(sourceDocument), IndexRequestDocumentUnavailableException)
  assert.deepEqual(events, ['write', 'read'])
  assert.equal(lock.mock.callCount(), 0)
})

test('a failed source write propagates without reading or locking a document', async (context) => {
  const failure = new Error('source write failed')
  const read = context.mock.fn(async () => null)
  const lock = context.mock.fn(async () => null)
  const useCase = new PrepareDocumentForIndexRequestCommandHandler({
    upsertBySourceTypeAndSourceKeyAndSourcePath: async () => {
      throw failure
    },
    findBySourceTypeAndSourceKeyAndSourcePath: read,
    lockByDocumentId: lock,
  } as unknown as DocumentRepository)

  await assert.rejects(useCase.execute(sourceDocument), (error: unknown) => error === failure)
  assert.equal(read.mock.callCount(), 0)
  assert.equal(lock.mock.callCount(), 0)
})
