import assert from 'node:assert/strict'
import test from 'node:test'

import type { SourceDocumentDto } from '../../../src/Application/Documents/DataTransferObjects/source-document.dto.ts'
import type { MembershipRepository } from '../../../src/Application/Memberships/Contracts/membership.repository.ts'
import { InvalidMembershipInputException } from '../../../src/Application/Memberships/Exceptions/invalid-membership-input.exception.ts'
import { ActivateMembershipIndexUseCase } from '../../../src/Application/Memberships/UseCases/activate-membership-index.use-case.ts'
import { PrepareMembershipForIndexRequestUseCase } from '../../../src/Application/Memberships/UseCases/prepare-membership-for-index-request.use-case.ts'
import { SaveMembershipIndexRequestUseCase } from '../../../src/Application/Memberships/UseCases/save-membership-index-request.use-case.ts'
import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import { InvalidMembershipStateException } from '../../../src/Domain/Membership/Exceptions/invalid-membership-state.exception.ts'
import { Membership } from '../../../src/Domain/Membership/membership.ts'

const sourceDocument: SourceDocumentDto = {
  knowledgeBaseId: 'kb-1',
  projectId: 'project-1',
  projectName: 'Project',
  sourceType: DocumentSourceTypeEnum.REPOSITORY,
  sourceKey: 'repo',
  sourcePath: 'page.md',
  content: 'content',
}
const membership = new Membership({
  knowledgeBaseId: 'kb-1',
  documentId: 'document-1',
  requestedGeneration: '0',
  activeDocumentIndexId: null,
  isEntry: true,
  alwaysIncludeFullContent: true,
  updatedAt: new Date(0),
})

test('membership source and supplied flags fail before persistence rather than taking the existing-row shortcut', async (context) => {
  const lock = context.mock.fn(async () => membership)
  const useCase = new PrepareMembershipForIndexRequestUseCase({
    lockByKnowledgeBaseIdAndDocumentId: lock,
  } as unknown as MembershipRepository)
  await assert.rejects(
    useCase.execute({
      sourceDocument: { ...sourceDocument, knowledgeBaseId: undefined } as unknown as SourceDocumentDto,
      documentId: 'document-1',
    }),
    InvalidMembershipInputException,
  )
  await assert.rejects(
    useCase.execute({ sourceDocument, documentId: undefined } as unknown as Parameters<typeof useCase.execute>[0]),
    InvalidMembershipInputException,
  )
  await assert.rejects(
    useCase.execute({
      sourceDocument: { ...sourceDocument, isEntry: null } as unknown as SourceDocumentDto,
      documentId: 'document-1',
    }),
    InvalidMembershipInputException,
  )
  assert.equal(lock.mock.callCount(), 0)
})

test('omitted membership configuration is a use-case no-op while false is a complete validated update', async (context) => {
  const update = context.mock.fn(async () => undefined)
  const useCase = new PrepareMembershipForIndexRequestUseCase({
    lockByKnowledgeBaseIdAndDocumentId: async () => membership,
    updateByKnowledgeBaseIdAndDocumentId: update,
  } as unknown as MembershipRepository)
  assert.equal(await useCase.execute({ sourceDocument, documentId: 'document-1' }), membership)
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
  const useCase = new SaveMembershipIndexRequestUseCase({
    updateByKnowledgeBaseIdAndDocumentId: write,
  } as unknown as MembershipRepository)
  const input = { membership, generation: '0', activeDocumentIndexId: null }
  await assert.rejects(
    useCase.execute({ ...input, generation: undefined } as unknown as typeof input),
    InvalidMembershipStateException,
  )
  await assert.rejects(
    useCase.execute({ ...input, activeDocumentIndexId: undefined } as unknown as typeof input),
    InvalidMembershipStateException,
  )
  assert.equal(write.mock.callCount(), 0)
})

test('activation requires all input fields before a missing or stale membership can return null', async (context) => {
  const find = context.mock.fn(async () => null)
  const useCase = new ActivateMembershipIndexUseCase({
    findByKnowledgeBaseIdAndDocumentId: find,
  } as unknown as MembershipRepository)
  const input = {
    knowledgeBaseId: 'kb-1',
    documentId: 'document-1',
    generation: '0',
    expectedActiveDocumentIndexId: null,
    documentIndexId: 'index-1',
  }
  await Promise.all(
    Object.keys(input).map(async (field) => {
      await assert.rejects(useCase.execute({ ...input, [field]: undefined }), InvalidMembershipInputException)
    }),
  )
  assert.equal(find.mock.callCount(), 0)
  assert.equal(await useCase.execute(input), null)
  assert.equal(find.mock.callCount(), 1)
})
