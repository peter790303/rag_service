import assert from 'node:assert/strict'
import test from 'node:test'

import { createRepositoryStub } from './document-index-lifecycle.fixture.ts'
import type { DocumentRelationRepository } from '../../../src/Application/DocumentRelations/Contracts/document-relation.repository.ts'
import { InvalidDocumentRelationInputException } from '../../../src/Application/DocumentRelations/Exceptions/invalid-document-relation-input.exception.ts'
import type { InsertPlannedDocumentRelationsQueryObject } from '../../../src/Application/DocumentRelations/QueryObjects/document-relation.query-object.ts'
import { CollectDocumentRelationGarbageUseCase } from '../../../src/Application/DocumentRelations/UseCases/collect-document-relation-garbage.use-case.ts'
import { ReplacePlannedDocumentRelationsUseCase } from '../../../src/Application/DocumentRelations/UseCases/replace-planned-document-relations.use-case.ts'
import { InvalidDocumentRelationStateException } from '../../../src/Domain/DocumentRelation/Exceptions/invalid-document-relation-state.exception.ts'

type ReplaceRelationsInput = Parameters<ReplacePlannedDocumentRelationsUseCase['execute']>[0]
const plannedRelation = {
  targetReference: 'Target.md',
  targetAnchor: null,
  relationType: 'wiki_link' as const,
  evidenceBlockStart: 0,
  evidenceBlockEnd: 0,
  evidenceText: '',
}

test('relation replacement rejects missing scope or malformed plan before clearing existing relations', async (context) => {
  const scenarios = [
    { name: 'missing input', input: undefined, exception: InvalidDocumentRelationInputException },
    {
      name: 'missing index with empty plan',
      input: { plannedDocumentRelations: [] },
      exception: InvalidDocumentRelationInputException,
    },
    { name: 'missing plan', input: { documentIndexId: 'index-1' }, exception: InvalidDocumentRelationInputException },
    {
      name: 'sparse plan',
      input: { documentIndexId: 'index-1', plannedDocumentRelations: new Array(1) },
      exception: InvalidDocumentRelationInputException,
    },
    {
      name: 'missing relation field',
      input: {
        documentIndexId: 'index-1',
        plannedDocumentRelations: [{ ...plannedRelation, targetAnchor: undefined }],
      },
      exception: InvalidDocumentRelationStateException,
    },
    {
      name: 'invalid relation range',
      input: { documentIndexId: 'index-1', plannedDocumentRelations: [{ ...plannedRelation, evidenceBlockStart: -1 }] },
      exception: InvalidDocumentRelationStateException,
    },
  ]
  await Promise.all(
    scenarios.map(({ name, input, exception }) =>
      context.test(name, async () => {
        const useCase = new ReplacePlannedDocumentRelationsUseCase(
          createRepositoryStub<DocumentRelationRepository>({
            removeBySourceIndexId: async () => assert.fail('invalid replacement must not clear stored relations'),
            insertPlanned: async () => assert.fail('invalid replacement must not write relations'),
          }),
        )
        await assert.rejects(useCase.execute(input as ReplaceRelationsInput), exception)
      }),
    ),
  )
})

test('relation replacement preserves null, zero and empty evidence, and an empty plan clears the scoped relations', async () => {
  const removedIndexes: string[] = []
  const writes: InsertPlannedDocumentRelationsQueryObject[] = []
  const useCase = new ReplacePlannedDocumentRelationsUseCase(
    createRepositoryStub<DocumentRelationRepository>({
      removeBySourceIndexId: async ({ sourceIndexId }) => {
        removedIndexes.push(sourceIndexId)
      },
      insertPlanned: async (query) => {
        writes.push(query)
      },
    }),
  )

  await useCase.execute({ documentIndexId: 'index-1', plannedDocumentRelations: [plannedRelation] })
  await useCase.execute({ documentIndexId: 'index-1', plannedDocumentRelations: [] })

  assert.deepEqual(removedIndexes, ['index-1', 'index-1'])
  assert.deepEqual(writes[0]?.relations, [
    {
      id: writes[0]?.relations[0]?.id,
      sourceIndexId: 'index-1',
      targetDocumentId: null,
      ...plannedRelation,
    },
  ])
  assert.match(writes[0]?.relations[0]?.id ?? '', /^[0-9a-f-]{36}$/)
  assert.deepEqual(writes[1], { relations: [] })
})

test('relation garbage collection rejects missing scope and lock facts even when no relations exist', async (context) => {
  const scenarios = [
    { name: 'missing input', input: undefined, exception: InvalidDocumentRelationInputException },
    { name: 'missing index', input: { lockedDocumentIds: [] }, exception: InvalidDocumentRelationInputException },
    {
      name: 'missing lock facts',
      input: { sourceIndexId: 'index-1' },
      exception: InvalidDocumentRelationInputException,
    },
    {
      name: 'sparse lock facts',
      input: { sourceIndexId: 'index-1', lockedDocumentIds: new Array(1) },
      exception: InvalidDocumentRelationInputException,
    },
  ]
  await Promise.all(
    scenarios.map(({ name, input, exception }) =>
      context.test(name, async () => {
        const useCase = new CollectDocumentRelationGarbageUseCase(
          createRepositoryStub<DocumentRelationRepository>({
            findBySourceIndexIdsOrderByIdAsc: async () => assert.fail('invalid scope must fail before persistence'),
            removeBySourceIndexId: async () => assert.fail('invalid scope must not delete'),
          }),
        )
        await assert.rejects(useCase.execute(input as Parameters<typeof useCase.execute>[0]), exception)
      }),
    ),
  )
})
