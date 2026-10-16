import assert from 'node:assert/strict'
import test from 'node:test'

import { InvalidMembershipIndexGenerationException } from '../../../../src/Domain/Membership/Exceptions/invalid-membership-index-generation.exception.ts'
import { InvalidMembershipStateException } from '../../../../src/Domain/Membership/Exceptions/invalid-membership-state.exception.ts'
import { Membership, type MembershipState } from '../../../../src/Domain/Membership/membership.ts'

const restoreMembership = (requestedGeneration = '8'): Membership =>
  new Membership({
    knowledgeBaseId: 'knowledge-base-1',
    documentId: 'document-1',
    requestedGeneration,
    activeDocumentIndexId: 'index-1',
    isEntry: true,
    alwaysIncludeFullContent: false,
    updatedAt: new Date('2026-10-09T00:00:00.000Z'),
  })

test('retaining an index request generation preserves membership identity and selects its active index', () => {
  const membership = restoreMembership()
  const requested = membership.requestIndex({ generation: '8', activeDocumentIndexId: 'index-2' })

  assert.equal(requested.knowledgeBaseId, 'knowledge-base-1')
  assert.equal(requested.documentId, 'document-1')
  assert.equal(requested.requestedGeneration, '8')
  assert.equal(requested.activeDocumentIndexId, 'index-2')
  assert.equal(requested.isEntry, true)
  assert.equal(requested.alwaysIncludeFullContent, false)
  assert.equal(requested.updatedAt.equals(membership.updatedAt), true)
  assert.equal(membership.activeDocumentIndexId, 'index-1')
})

test('advancing an index request uses exact integer precision beyond Number.MAX_SAFE_INTEGER', () => {
  const membership = restoreMembership('9007199254740992')
  const requested = membership.requestIndex({ generation: '9007199254740993', activeDocumentIndexId: null })

  assert.equal(requested.requestedGeneration, '9007199254740993')
  assert.equal(requested.activeDocumentIndexId, null)
  assert.equal(membership.requestedGeneration, '9007199254740992')
})

test('a previous generation is rejected without changing membership state', () => {
  const membership = restoreMembership()

  assert.throws(
    () => membership.requestIndex({ generation: '7', activeDocumentIndexId: null }),
    (error: unknown) => {
      assert.ok(error instanceof InvalidMembershipIndexGenerationException)
      assert.equal(error.code, 'INVALID_MEMBERSHIP_INDEX_GENERATION')
      assert.deepEqual(error.context, { currentGeneration: '8', requestedGeneration: '7' })

      return true
    },
  )
  assert.equal(membership.requestedGeneration, '8')
  assert.equal(membership.activeDocumentIndexId, 'index-1')
})

test('skipping a generation is rejected even above Number.MAX_SAFE_INTEGER', () => {
  const membership = restoreMembership('9007199254740992')

  assert.throws(
    () => membership.requestIndex({ generation: '9007199254740994', activeDocumentIndexId: null }),
    InvalidMembershipIndexGenerationException,
  )
})

test('required membership state cannot be erased by a missing field', () => {
  const validState: MembershipState = {
    knowledgeBaseId: 'knowledge-base-1',
    documentId: 'document-1',
    requestedGeneration: '0',
    activeDocumentIndexId: null,
    isEntry: false,
    alwaysIncludeFullContent: false,
    updatedAt: new Date(0),
  }

  Object.keys(validState).forEach((field) => {
    assert.throws(() => new Membership({ ...validState, [field]: undefined }), InvalidMembershipStateException)
  })
  const membership = new Membership(validState)
  assert.equal(membership.requestedGeneration, '0')
  assert.equal(membership.activeDocumentIndexId, null)
  assert.equal(membership.isEntry, false)
  assert.equal(membership.updatedAt.epochMilliseconds, 0)
})

test('membership configuration preserves omitted flags, applies false, and rejects null', () => {
  const membership = restoreMembership()
  assert.equal(membership.configure({}, membership.updatedAt).isEntry, true)
  assert.equal(membership.configure({ isEntry: false }, membership.updatedAt).isEntry, false)
  assert.throws(
    () => membership.configure({ isEntry: null } as unknown as { isEntry: boolean }, membership.updatedAt),
    InvalidMembershipStateException,
  )
})
