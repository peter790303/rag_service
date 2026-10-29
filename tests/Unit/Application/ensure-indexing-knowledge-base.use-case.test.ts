import assert from 'node:assert/strict'
import test from 'node:test'

import type { KnowledgeBaseRepository } from '../../../src/Application/KnowledgeBases/Contracts/knowledge-base.repository.ts'
import { InvalidIndexingKnowledgeBaseInputException } from '../../../src/Application/KnowledgeBases/Exceptions/invalid-indexing-knowledge-base-input.exception.ts'
import { EnsureIndexingKnowledgeBaseUseCase } from '../../../src/Application/KnowledgeBases/UseCases/ensure-indexing-knowledge-base.use-case.ts'
import { KnowledgeBaseProjectMismatchException } from '../../../src/Domain/KnowledgeBase/Exceptions/knowledge-base-project-mismatch.exception.ts'
import { KnowledgeBase } from '../../../src/Domain/KnowledgeBase/knowledge-base.ts'

const input = { knowledgeBaseId: 'kb-1', projectId: 'project-1', projectName: 'Project' }

test('knowledge-base required inputs fail before the existing-row or same-name shortcuts', async (context) => {
  const lock = context.mock.fn(async () => null)
  const useCase = new EnsureIndexingKnowledgeBaseUseCase({
    lockByKnowledgeBaseId: lock,
  } as unknown as KnowledgeBaseRepository)
  await Promise.all(
    Object.keys(input).map(async (field) => {
      await assert.rejects(
        useCase.execute({ ...input, [field]: undefined }),
        InvalidIndexingKnowledgeBaseInputException,
      )
      await assert.rejects(useCase.execute({ ...input, [field]: '' }), InvalidIndexingKnowledgeBaseInputException)
    }),
  )
  assert.equal(lock.mock.callCount(), 0)
})

test('new knowledge bases are validated as entities before creating a complete write', async (context) => {
  const createIfAbsent = context.mock.fn<KnowledgeBaseRepository['createIfAbsent']>(async () => true)
  const useCase = new EnsureIndexingKnowledgeBaseUseCase({
    lockByKnowledgeBaseId: async () => null,
    createIfAbsent,
  } as unknown as KnowledgeBaseRepository)
  await useCase.execute(input)
  const [query] = createIfAbsent.mock.calls[0]?.arguments ?? []
  assert.ok(query)
  assert.deepEqual(query, { ...input, createdAt: query.createdAt, updatedAt: query.createdAt })
  assert.ok(query.createdAt instanceof Date)
})

test('renaming preserves creation time and project ownership remains a Domain invariant', async (context) => {
  const knowledgeBase = KnowledgeBase.create({
    id: 'kb-1',
    projectId: 'project-1',
    projectName: 'Original',
    createdAt: new Date(0),
    updatedAt: new Date(0),
  })
  const update = context.mock.fn(async () => undefined)
  const useCase = new EnsureIndexingKnowledgeBaseUseCase({
    lockByKnowledgeBaseId: async () => knowledgeBase,
    update,
  } as unknown as KnowledgeBaseRepository)
  await useCase.execute(input)
  assert.deepEqual(update.mock.calls[0]?.arguments, [{ ...input, updatedAt: knowledgeBase.updatedAt }])
  assert.equal(knowledgeBase.createdAt.getTime(), 0)
  await useCase.execute(input)
  assert.equal(update.mock.callCount(), 1)
  await assert.rejects(
    useCase.execute({ ...input, projectId: 'another-project' }),
    KnowledgeBaseProjectMismatchException,
  )
  assert.equal(update.mock.callCount(), 1)
})
