import assert from 'node:assert/strict'
import test from 'node:test'

import { ActivateKnowledgeBaseDocumentIndexCommandHandler } from '../../../src/KnowledgeBases/Application/Commands/activate-knowledge-base-document-index.command.handler.ts'
import { PrepareKnowledgeBaseDocumentForIndexRequestCommandHandler } from '../../../src/KnowledgeBases/Application/Commands/prepare-knowledge-base-document-for-index-request.command.handler.ts'
import { SaveKnowledgeBaseDocumentIndexRequestCommandHandler } from '../../../src/KnowledgeBases/Application/Commands/save-knowledge-base-document-index-request.command.handler.ts'
import type { PrepareKnowledgeBaseDocumentForIndexRequestDTO } from '../../../src/KnowledgeBases/Application/DataTransferObjects/prepare-knowledge-base-document-for-index-request.dto.ts'
import { InvalidKnowledgeBaseDocumentInputException } from '../../../src/KnowledgeBases/Application/Exceptions/invalid-knowledge-base-document-input.exception.ts'
import type { KnowledgeBaseDocumentRepository } from '../../../src/KnowledgeBases/Application/Ports/Out/Repositories/knowledge-base-document.repository.ts'
import { KnowledgeBaseDocument } from '../../../src/KnowledgeBases/Domain/Entities/knowledge-base-document.ts'
import { InvalidKnowledgeBaseDocumentStateException } from '../../../src/KnowledgeBases/Domain/Exceptions/invalid-knowledge-base-document-state.exception.ts'

const sourceDocument: PrepareKnowledgeBaseDocumentForIndexRequestDTO['sourceDocument'] = {
  knowledgeBaseId: 'kb-1',
}
const knowledgeBaseDocument = new KnowledgeBaseDocument({
  knowledgeBaseId: 'kb-1',
  documentId: 'document-1',
  requestedGeneration: '0',
  activeDocumentIndexId: null,
  isEntry: true,
  alwaysIncludeFullContent: true,
  updatedAt: new Date(0),
})

test('knowledgeBaseDocument source and supplied flags fail before persistence rather than taking the existing-row shortcut', async (context) => {
  const lock = context.mock.fn(async () => knowledgeBaseDocument)
  const useCase = new PrepareKnowledgeBaseDocumentForIndexRequestCommandHandler({
    lockByKnowledgeBaseIdAndDocumentId: lock,
  } as unknown as KnowledgeBaseDocumentRepository)
  await assert.rejects(
    useCase.execute({
      sourceDocument: {
        ...sourceDocument,
        knowledgeBaseId: undefined,
      } as unknown as PrepareKnowledgeBaseDocumentForIndexRequestDTO['sourceDocument'],
      documentId: 'document-1',
    }),
    InvalidKnowledgeBaseDocumentInputException,
  )
  await assert.rejects(
    useCase.execute(undefined as unknown as Parameters<typeof useCase.execute>[0]),
    InvalidKnowledgeBaseDocumentInputException,
  )
  await assert.rejects(
    useCase.execute({ sourceDocument, documentId: undefined } as unknown as Parameters<typeof useCase.execute>[0]),
    InvalidKnowledgeBaseDocumentInputException,
  )
  await assert.rejects(
    useCase.execute({ sourceDocument: null } as unknown as Parameters<typeof useCase.execute>[0]),
    InvalidKnowledgeBaseDocumentInputException,
  )
  await assert.rejects(
    useCase.execute({
      sourceDocument: {
        ...sourceDocument,
        isEntry: null,
      } as unknown as PrepareKnowledgeBaseDocumentForIndexRequestDTO['sourceDocument'],
      documentId: 'document-1',
    }),
    InvalidKnowledgeBaseDocumentInputException,
  )
  assert.equal(lock.mock.callCount(), 0)
})

test('omitted knowledgeBaseDocument configuration is a use-case no-op while false is a complete validated update', async (context) => {
  const update = context.mock.fn(async () => undefined)
  const useCase = new PrepareKnowledgeBaseDocumentForIndexRequestCommandHandler({
    lockByKnowledgeBaseIdAndDocumentId: async () => knowledgeBaseDocument,
    updateByKnowledgeBaseIdAndDocumentId: update,
  } as unknown as KnowledgeBaseDocumentRepository)
  assert.equal(await useCase.execute({ sourceDocument, documentId: 'document-1' }), knowledgeBaseDocument)
  assert.equal(update.mock.callCount(), 0)
  const updated = await useCase.execute({
    sourceDocument: { ...sourceDocument, isEntry: false },
    documentId: 'document-1',
  })
  assert.deepEqual(update.mock.calls[0]?.arguments, [
    {
      knowledgeBaseId: 'kb-1',
      documentId: 'document-1',
      requestedGeneration: '0',
      activeDocumentIndexId: null,
      isEntry: false,
      alwaysIncludeFullContent: true,
      updatedAt: updated.updatedAt.nativeDate,
    },
  ])
})

test('a missing request generation or active index fails in Domain before assembling a write', async (context) => {
  const write = context.mock.fn(async () => undefined)
  const useCase = new SaveKnowledgeBaseDocumentIndexRequestCommandHandler({
    updateByKnowledgeBaseIdAndDocumentId: write,
  } as unknown as KnowledgeBaseDocumentRepository)
  const input = { knowledgeBaseDocument, generation: '0', activeDocumentIndexId: null }
  await assert.rejects(
    useCase.execute({ ...input, generation: undefined } as unknown as typeof input),
    InvalidKnowledgeBaseDocumentStateException,
  )
  await assert.rejects(
    useCase.execute({ ...input, activeDocumentIndexId: undefined } as unknown as typeof input),
    InvalidKnowledgeBaseDocumentStateException,
  )
  assert.equal(write.mock.callCount(), 0)
})

test('activation requires all input fields before a missing or stale knowledgeBaseDocument can return null', async (context) => {
  const find = context.mock.fn(async () => null)
  const useCase = new ActivateKnowledgeBaseDocumentIndexCommandHandler({
    findByKnowledgeBaseIdAndDocumentId: find,
  } as unknown as KnowledgeBaseDocumentRepository)
  const input = {
    knowledgeBaseId: 'kb-1',
    documentId: 'document-1',
    generation: '0',
    expectedActiveDocumentIndexId: null,
    documentIndexId: 'index-1',
  }
  await Promise.all(
    Object.keys(input).map(async (field) => {
      await assert.rejects(
        useCase.execute({ ...input, [field]: undefined }),
        InvalidKnowledgeBaseDocumentInputException,
      )
    }),
  )
  assert.equal(find.mock.callCount(), 0)
  assert.equal(await useCase.execute(input), null)
  assert.equal(find.mock.callCount(), 1)
})
