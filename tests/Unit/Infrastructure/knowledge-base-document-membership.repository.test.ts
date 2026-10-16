import assert from 'node:assert/strict'
import test from 'node:test'

import { DataSource, type EntityManager, IsNull } from 'typeorm'

import type { MembershipActivationQueryObject } from '../../../src/Application/Memberships/QueryObjects/membership.query-object.ts'
import { Membership } from '../../../src/Domain/Membership/membership.ts'
import { KnowledgeBaseDocumentMembershipModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base-document-membership.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { KnowledgeBaseDocumentMembershipRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base-document-membership.repository.ts'

const createRepositoryManagerStub = (): EntityManager => new DataSource({ type: 'postgres' }).manager

test('full membership updates retain false, zero generation and null, while detach writes only its own fields', async (context) => {
  const manager = createRepositoryManagerStub()
  const modelRepository = manager.getRepository(KnowledgeBaseDocumentMembershipModel)
  const update = context.mock.method(modelRepository, 'update', async () => ({
    affected: 1,
    raw: [],
    generatedMaps: [],
  }))
  const repository = new KnowledgeBaseDocumentMembershipRepository(new PersistenceTransaction(manager.connection))
  const identity = { knowledgeBaseId: 'kb-1', documentId: 'document-1' }
  const updatedAt = new Date(0)
  const state = {
    isEntry: false,
    alwaysIncludeFullContent: false,
    requestedGeneration: '0',
    activeDocumentIndexId: null,
    updatedAt,
  }

  await repository.updateByKnowledgeBaseIdAndDocumentId({ ...identity, ...state })
  await repository.updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentId({
    ...identity,
    activeDocumentIndexId: null,
    updatedAt,
  })

  assert.deepEqual(
    update.mock.calls.map((call) => call.arguments),
    [
      [identity, state],
      [identity, { activeDocumentIndexId: null, updatedAt }],
    ],
  )
})

test('membership full reads restore domain generation and retain actual persistence settings without extra queries', async (context) => {
  const manager = createRepositoryManagerStub()
  const membershipModelRepository = manager.getRepository(KnowledgeBaseDocumentMembershipModel)
  const updatedAt = new Date('2026-10-14T12:00:00.000Z')
  const persistedMembership = Object.assign(new KnowledgeBaseDocumentMembershipModel(), {
    knowledgeBaseId: 'kb-1',
    documentId: 'document-1',
    requestedGeneration: '9007199254740993',
    activeDocumentIndexId: 'index-1',
    isEntry: true,
    alwaysIncludeFullContent: false,
    updatedAt,
  })
  const findOneBy = context.mock.method(membershipModelRepository, 'findOneBy', async () => persistedMembership)
  const membershipRepository = new KnowledgeBaseDocumentMembershipRepository(
    new PersistenceTransaction(manager.connection),
  )

  const restoredMembershipDTO = await membershipRepository.findByKnowledgeBaseIdAndDocumentId({
    knowledgeBaseId: 'kb-1',
    documentId: 'document-1',
  })

  assert.ok(restoredMembershipDTO instanceof Membership)
  assert.equal(restoredMembershipDTO.requestedGeneration, '9007199254740993')
  assert.equal(restoredMembershipDTO.activeDocumentIndexId, 'index-1')
  assert.equal(restoredMembershipDTO.isEntry, true)
  assert.equal(restoredMembershipDTO.alwaysIncludeFullContent, false)
  assert.deepEqual(restoredMembershipDTO.updatedAt.nativeDate, updatedAt)
  assert.notEqual(restoredMembershipDTO.updatedAt.nativeDate, updatedAt)
  assert.equal(findOneBy.mock.callCount(), 1)
  assert.deepEqual(findOneBy.mock.calls[0]?.arguments, [{ knowledgeBaseId: 'kb-1', documentId: 'document-1' }])
})

test('membership availability locks preserve the knowledge-base/document pair and skip contention', async (context) => {
  const manager = createRepositoryManagerStub()
  const membershipModelRepository = manager.getRepository(KnowledgeBaseDocumentMembershipModel)
  const findOne = context.mock.method(membershipModelRepository, 'findOne', async () => null)

  assert.equal(
    await new KnowledgeBaseDocumentMembershipRepository(
      new PersistenceTransaction(manager.connection),
    ).lockByKnowledgeBaseIdAndDocumentIdSkipLocked({ knowledgeBaseId: 'kb-1', documentId: 'document-1' }),
    null,
  )
  assert.deepEqual(findOne.mock.calls[0]?.arguments, [
    {
      where: { knowledgeBaseId: 'kb-1', documentId: 'document-1' },
      lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
    },
  ])
})

test('membership activation retains generation and null/index CAS fences with affected-row results', async (context) => {
  const manager = createRepositoryManagerStub()
  const membershipModelRepository = manager.getRepository(KnowledgeBaseDocumentMembershipModel)
  let affected = 1
  const update = context.mock.method(membershipModelRepository, 'update', async () => ({
    affected,
    raw: [],
    generatedMaps: [],
  }))
  const membershipRepository = new KnowledgeBaseDocumentMembershipRepository(
    new PersistenceTransaction(manager.connection),
  )
  const membershipActivationQO: MembershipActivationQueryObject = {
    knowledgeBaseId: 'kb-1',
    documentId: 'document-1',
    requestedGeneration: '2',
    expectedActiveDocumentIndexId: null,
    documentIndexId: 'index-2',
    updatedAt: new Date('2026-10-14T12:00:00.000Z'),
  }

  const persistedMembership = Object.assign(new KnowledgeBaseDocumentMembershipModel(), {
    knowledgeBaseId: 'kb-1',
    documentId: 'document-1',
    requestedGeneration: '2',
    activeDocumentIndexId: 'index-2',
    isEntry: false,
    alwaysIncludeFullContent: false,
    updatedAt: membershipActivationQO.updatedAt,
  })
  const findOneBy = context.mock.method(membershipModelRepository, 'findOneBy', async () => persistedMembership)
  const activatedMembership =
    await membershipRepository.updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId(
      membershipActivationQO,
    )
  assert.ok(activatedMembership instanceof Membership)
  assert.equal(activatedMembership.activeDocumentIndexId, 'index-2')
  assert.equal(activatedMembership.requestedGeneration, '2')
  assert.deepEqual(activatedMembership.updatedAt.nativeDate, membershipActivationQO.updatedAt)
  affected = 0
  assert.equal(
    await membershipRepository.updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId(
      { ...membershipActivationQO, expectedActiveDocumentIndexId: 'index-1' },
    ),
    null,
  )
  assert.equal(findOneBy.mock.callCount(), 1)
  assert.deepEqual(findOneBy.mock.calls[0]?.arguments, [{ knowledgeBaseId: 'kb-1', documentId: 'document-1' }])
  assert.deepEqual(update.mock.calls[0]?.arguments, [
    {
      knowledgeBaseId: 'kb-1',
      documentId: 'document-1',
      requestedGeneration: '2',
      activeDocumentIndexId: IsNull(),
    },
    { activeDocumentIndexId: 'index-2', updatedAt: membershipActivationQO.updatedAt },
  ])
  assert.deepEqual(update.mock.calls[1]?.arguments, [
    {
      knowledgeBaseId: 'kb-1',
      documentId: 'document-1',
      requestedGeneration: '2',
      activeDocumentIndexId: 'index-1',
    },
    { activeDocumentIndexId: 'index-2', updatedAt: membershipActivationQO.updatedAt },
  ])
})
