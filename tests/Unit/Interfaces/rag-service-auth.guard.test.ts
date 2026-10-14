import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import test from 'node:test'

import { UnauthorizedException, type ExecutionContext } from '@nestjs/common'

import type { RagConfig } from '../../../config/rag.config.js'
import { RagServiceAuthenticator } from '../../../src/Infrastructure/Auth/rag-service-authenticator.js'
import { RagServiceAuthGuard } from '../../../src/Interfaces/Http/Middleware/rag-service-auth.guard.js'

const secret = 'a-test-secret-that-is-at-least-32-characters-long'
const requestBody = { projectId: 'project-a', documents: [] }
const requestPath = '/v1/index-requests'

const signedHeaders = (projectId: string, issuedAt: string): Record<string, string> => {
  const payloadHash = createHash('sha256').update(JSON.stringify(requestBody)).digest('hex')
  const canonicalRequest = ['POST', requestPath, issuedAt, projectId, payloadHash].join('\n')
  const signature = createHmac('sha256', secret).update(canonicalRequest).digest('hex')

  return {
    'x-rag-project-id': projectId,
    'x-rag-issued-at': issuedAt,
    'x-rag-signature': signature,
  }
}

const contextFor = (headers: Record<string, string>): ExecutionContext => {
  const request = {
    body: requestBody,
    method: 'POST',
    params: {},
    path: requestPath,
    query: {},
    header: (name: string) => headers[name],
  }

  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

const routeContextFor = (
  projectId: string,
  headers: Record<string, string>,
  method = 'GET',
  path = `/v1/projects/${projectId}/jobs/job-id`,
  body: Record<string, unknown> = {},
  query: Record<string, unknown> = {},
): ExecutionContext => {
  const request = {
    body,
    method,
    params: { projectId },
    path,
    query,
    header: (name: string) => headers[name],
  }

  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

const routeSignedHeaders = (projectId: string, issuedAt: string): Record<string, string> => {
  const payloadHash = createHash('sha256').update(JSON.stringify({})).digest('hex')
  const routePath = `/v1/projects/${projectId}/jobs/job-id`
  const canonicalRequest = ['GET', routePath, issuedAt, projectId, payloadHash].join('\n')
  const signature = createHmac('sha256', secret).update(canonicalRequest).digest('hex')

  return {
    'x-rag-project-id': projectId,
    'x-rag-issued-at': issuedAt,
    'x-rag-signature': signature,
  }
}

const retrySignedHeaders = (projectId: string, issuedAt: string): Record<string, string> => {
  const payloadHash = createHash('sha256').update(JSON.stringify({})).digest('hex')
  const routePath = `/v1/projects/${projectId}/failed-jobs/job-id/retry`
  const canonicalRequest = ['POST', routePath, issuedAt, projectId, payloadHash].join('\n')
  const signature = createHmac('sha256', secret).update(canonicalRequest).digest('hex')

  return {
    'x-rag-project-id': projectId,
    'x-rag-issued-at': issuedAt,
    'x-rag-signature': signature,
  }
}

const authenticator = new RagServiceAuthenticator({ serviceAuthSecret: secret } as RagConfig)
const guard = new RagServiceAuthGuard(authenticator)

test('accepts a valid signature scoped to the body projectId', () => {
  const issuedAt = String(Date.now())
  assert.equal(guard.canActivate(contextFor(signedHeaders('project-a', issuedAt))), true)
})

test('rejects a signed caller scope that differs from body projectId', () => {
  const issuedAt = String(Date.now())
  assert.throws(() => guard.canActivate(contextFor(signedHeaders('project-b', issuedAt))), UnauthorizedException)
})

test('rejects unsigned requests', () => {
  assert.throws(() => guard.canActivate(contextFor({})), UnauthorizedException)
})

test('accepts a valid signature scoped to a route projectId without a body', () => {
  const issuedAt = String(Date.now())

  assert.equal(guard.canActivate(routeContextFor('project-a', routeSignedHeaders('project-a', issuedAt))), true)
})

test('rejects a route projectId that differs from the signed caller scope', () => {
  const issuedAt = String(Date.now())

  assert.throws(
    () => guard.canActivate(routeContextFor('project-a', routeSignedHeaders('project-b', issuedAt))),
    UnauthorizedException,
  )
})

test('accepts a retry request signed for its route projectId', () => {
  const issuedAt = String(Date.now())

  assert.equal(
    guard.canActivate(
      routeContextFor(
        'project-a',
        retrySignedHeaders('project-a', issuedAt),
        'POST',
        '/v1/projects/project-a/failed-jobs/job-id/retry',
      ),
    ),
    true,
  )
})

test('rejects a correctly signed route request with a conflicting query project scope', () => {
  const issuedAt = String(Date.now())

  assert.throws(
    () =>
      guard.canActivate(
        routeContextFor(
          'project-a',
          routeSignedHeaders('project-a', issuedAt),
          'GET',
          undefined,
          {},
          {
            projectId: 'project-b',
          },
        ),
      ),
    UnauthorizedException,
  )
})

test('rejects a correctly signed retry body with a conflicting route project scope', () => {
  const issuedAt = String(Date.now())
  const path = '/v1/projects/project-a/failed-jobs/job-id/retry'
  const body = { projectId: 'project-b' }
  const payloadHash = createHash('sha256').update(JSON.stringify(body)).digest('hex')
  const signature = createHmac('sha256', secret)
    .update(['POST', path, issuedAt, 'project-a', payloadHash].join('\n'))
    .digest('hex')
  const headers = {
    'x-rag-project-id': 'project-a',
    'x-rag-issued-at': issuedAt,
    'x-rag-signature': signature,
  }

  assert.throws(
    () => guard.canActivate(routeContextFor('project-a', headers, 'POST', path, body)),
    UnauthorizedException,
  )
})
