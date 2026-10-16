import assert from 'node:assert/strict'
import test from 'node:test'

import type { DocumentRepository } from '../../../src/Application/Documents/Contracts/document.repository.ts'
import type { SourceDocumentDto } from '../../../src/Application/Documents/DataTransferObjects/source-document.dto.ts'
import { InvalidDocumentSourceInputException } from '../../../src/Application/Documents/Exceptions/invalid-document-source-input.exception.ts'
import { PrepareDocumentForIndexRequestUseCase } from '../../../src/Application/Documents/UseCases/prepare-document-for-index-request.use-case.ts'
import { Document } from '../../../src/Domain/Document/document.ts'
import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import { InvalidDocumentSourceException } from '../../../src/Domain/Document/Exceptions/invalid-document-source.exception.ts'

const sourceDocument: SourceDocumentDto = {
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
    lockByDocumentId: access,
  } as unknown as DocumentRepository
  const useCase = new PrepareDocumentForIndexRequestUseCase(repository)

  await Promise.all(
    ['sourceType', 'sourceKey', 'sourcePath'].map(async (field) => {
      await assert.rejects(useCase.execute({ ...sourceDocument, [field]: undefined }), InvalidDocumentSourceException)
    }),
  )
  await assert.rejects(
    useCase.execute({ ...sourceDocument, title: false } as unknown as SourceDocumentDto),
    InvalidDocumentSourceException,
  )
  await assert.rejects(useCase.execute(undefined as unknown as SourceDocumentDto), InvalidDocumentSourceInputException)
  await assert.rejects(useCase.execute(null as unknown as SourceDocumentDto), InvalidDocumentSourceInputException)
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
  const preserve = context.mock.fn<DocumentRepository['upsertBySourceTypeAndSourceKeyAndSourcePath']>(
    async () => document,
  )
  const replace = context.mock.fn<DocumentRepository['upsertTitleBySourceTypeAndSourceKeyAndSourcePath']>(
    async () => document,
  )
  const lock = context.mock.fn(async () => document)
  const useCase = new PrepareDocumentForIndexRequestUseCase({
    upsertBySourceTypeAndSourceKeyAndSourcePath: preserve,
    upsertTitleBySourceTypeAndSourceKeyAndSourcePath: replace,
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
  assert.equal(lock.mock.callCount(), 4)
})
