import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import test from 'node:test'

import type { KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import type { ServiceAuthCredentialsDTO } from '../../../src/Application/KnowledgeBases/DataTransferObjects/service-auth-credentials.dto.ts'
import { HmacProjectServiceAuthenticator } from '../../../src/Infrastructure/Auth/hmac-project-service.authenticator.ts'

const secret = 'a-test-secret-that-is-at-least-32-characters-long'
const body = { projectId: 'project-a', documents: [] }
const method = 'POST'
const path = '/v1/index-requests'

const signedCredentials = (issuedAt = String(Date.now())): ServiceAuthCredentialsDTO => {
  const payloadHash = createHash('sha256').update(JSON.stringify(body)).digest('hex')
  const canonicalRequest = [method, path, issuedAt, 'project-a', payloadHash].join('\n')
  const signature = createHmac('sha256', secret).update(canonicalRequest).digest('hex')

  return {
    body,
    headerProjectId: 'project-a',
    issuedAt,
    method,
    path,
    projectId: 'project-a',
    signature,
  }
}

const authenticator = new HmacProjectServiceAuthenticator({ serviceAuthSecret: secret } as KnowledgeServiceConfig)

test('authenticator verifies a fresh signature scoped to the request project', () => {
  assert.equal(authenticator.authenticate(signedCredentials()), true)
})

test('authenticator rejects a signature with a different project scope', () => {
  assert.equal(authenticator.authenticate({ ...signedCredentials(), headerProjectId: 'project-b' }), false)
})

test('authenticator rejects expired credentials', () => {
  const expiredTimestamp = String(Date.now() - 300_001)

  assert.equal(authenticator.authenticate(signedCredentials(expiredTimestamp)), false)
})

test('authenticator rejects malformed signatures', () => {
  assert.equal(authenticator.authenticate({ ...signedCredentials(), signature: 'not-a-signature' }), false)
})
