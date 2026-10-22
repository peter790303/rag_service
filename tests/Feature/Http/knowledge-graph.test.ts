import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { test } from 'node:test'

import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { ServiceAuthenticator } from '../../../src/Application/KnowledgeBases/Contracts/service-authenticator.ts'
import type { LoadKnowledgeGraphDTO } from '../../../src/Application/KnowledgeBases/DataTransferObjects/load-knowledge-graph.dto.ts'
import { KNOWLEDGE_GRAPH_CATALOG_SCOPE } from '../../../src/Application/KnowledgeBases/knowledge-graph-catalog-scope.ts'
import { ListKnowledgeGraphProjectsUseCase } from '../../../src/Application/KnowledgeBases/UseCases/list-knowledge-graph-projects.use-case.ts'
import { LoadKnowledgeGraphUseCase } from '../../../src/Application/KnowledgeBases/UseCases/load-knowledge-graph.use-case.ts'
import { KnowledgeBase } from '../../../src/Domain/KnowledgeBase/knowledge-base.ts'
import { HmacProjectServiceAuthenticator } from '../../../src/Infrastructure/Auth/hmac-project-service.authenticator.ts'
import { KnowledgeGraphController } from '../../../src/Interfaces/Http/Controllers/knowledge-graph.controller.ts'
import { createGlobalValidationPipe } from '../../../src/Interfaces/Http/Pipes/create-global-validation-pipe.ts'
import { createKnowledgeServiceConfigFixture } from '../../Support/knowledge-service-config.fixture.ts'

const secret = 'graph-test-secret-long-enough'
const requests: LoadKnowledgeGraphDTO[] = []

@Module({
  controllers: [KnowledgeGraphController],
  providers: [
    {
      provide: ServiceAuthenticator,
      useValue: new HmacProjectServiceAuthenticator(createKnowledgeServiceConfigFixture({ serviceAuthSecret: secret })),
    },
    {
      provide: ListKnowledgeGraphProjectsUseCase,
      useValue: {
        execute: async () => [
          KnowledgeBase.create({
            id: '11111111-1111-4111-8111-111111111111',
            projectId: 'rag-service',
            projectName: 'Rag-Service',
            createdAt: new Date(0),
            updatedAt: new Date(0),
          }),
          KnowledgeBase.create({
            id: '22222222-2222-4222-8222-222222222222',
            projectId: 'agent-teams-web',
            projectName: 'agent-teams-web',
            createdAt: new Date(0),
            updatedAt: new Date(0),
          }),
        ],
      },
    },
    {
      provide: LoadKnowledgeGraphUseCase,
      useValue: {
        execute: async (request: LoadKnowledgeGraphDTO) => {
          requests.push(request)

          if (request.projectId === 'missing') return null

          const knowledgeBase = KnowledgeBase.create({
            id: 'private-kb-id',
            projectId: request.projectId,
            projectName: 'Private project name',
            createdAt: new Date(0),
            updatedAt: new Date(0),
          })
          knowledgeBase.recordGraph({
            status: request.documentId ? 'document_not_found' : 'empty',
            centerDocumentId: request.documentId ?? null,
            nodes: [],
            edges: [],
            meta: {
              totalDocuments: 0,
              eligibleDocuments: 0,
              returnedDocuments: 0,
              truncated: false,
              omittedDocuments: 0,
              semantic: {
                strategy: 'representative_chunks',
                sampledChunksPerDocument: 3,
                minSimilarity: request.minSimilarity ?? 0.65,
                available: false,
              },
              warnings: [],
            },
          })

          return knowledgeBase
        },
      },
    },
  ],
})
class KnowledgeGraphHttpTestModule {}

const signedHeaders = (path: string, projectId: string) => {
  const issuedAt = String(Date.now())
  const hash = createHash('sha256').update('{}').digest('hex')

  return {
    'x-rag-project-id': projectId,
    'x-rag-issued-at': issuedAt,
    'x-rag-signature': createHmac('sha256', secret)
      .update(['GET', path, issuedAt, projectId, hash].join('\n'))
      .digest('hex'),
  }
}

test('graph HTTP authenticates route project, validates bounded query, and exposes the whitelisted graph', async () => {
  const app = await NestFactory.create(KnowledgeGraphHttpTestModule, { logger: false })
  app.useGlobalPipes(createGlobalValidationPipe())
  try {
    await app.listen(0, '127.0.0.1')
    const url = await app.getUrl()
    const path = '/v1/projects/project/knowledge-graph'
    const unauthenticated = await fetch(`${url}${path}`)
    assert.equal(unauthenticated.status, 401)
    const wrongProject = await fetch(`${url}${path}`, { headers: signedHeaders(path, 'other-project') })
    assert.equal(wrongProject.status, 401)
    const invalidLimit = await fetch(`${url}${path}?limit=101`, { headers: signedHeaders(path, 'project') })
    assert.equal(invalidLimit.status, 422)
    const invalidDocument = await fetch(`${url}${path}?documentId=not-a-uuid`, {
      headers: signedHeaders(path, 'project'),
    })
    assert.equal(invalidDocument.status, 422)
    const invalidSimilarity = await fetch(`${url}${path}?minSimilarity=1.1`, {
      headers: signedHeaders(path, 'project'),
    })
    assert.equal(invalidSimilarity.status, 422)
    const valid = await fetch(`${url}${path}?limit=20&minSimilarity=0.8&query=hello`, {
      headers: signedHeaders(path, 'project'),
    })
    assert.equal(valid.status, 200)
    const body = (await valid.json()) as Record<string, unknown>
    assert.deepEqual(Object.keys(body).sort(), ['centerDocumentId', 'edges', 'meta', 'nodes', 'projectId', 'status'])
    assert.equal(body.projectId, 'project')
    assert.equal(body.status, 'empty')
    assert.deepEqual(requests.at(-1), { projectId: 'project', limit: 20, minSimilarity: 0.8, query: 'hello' })
    const missingPath = '/v1/projects/missing/knowledge-graph'
    const missing = await fetch(`${url}${missingPath}`, { headers: signedHeaders(missingPath, 'missing') })
    assert.equal(missing.status, 404)
    const catalogPath = '/v1/knowledge-graph/projects'
    assert.equal((await fetch(`${url}${catalogPath}`)).status, 401)
    assert.equal((await fetch(`${url}${catalogPath}`, { headers: signedHeaders(catalogPath, 'project') })).status, 401)
    const catalog = await fetch(`${url}${catalogPath}`, {
      headers: signedHeaders(catalogPath, KNOWLEDGE_GRAPH_CATALOG_SCOPE),
    })
    assert.equal(catalog.status, 200)
    assert.deepEqual(await catalog.json(), {
      projects: [
        { id: 'rag-service', name: 'Rag-Service' },
        { id: 'agent-teams-web', name: 'agent-teams-web' },
      ],
    })
  } finally {
    await app.close()
  }
})
