import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { test } from 'node:test'

import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { ServiceAuthenticator } from '../../../src/Application/KnowledgeBases/Contracts/service-authenticator.ts'
import { LoadIndexManifestUseCase } from '../../../src/Application/KnowledgeBases/UseCases/load-index-manifest.use-case.ts'
import { HmacProjectServiceAuthenticator } from '../../../src/Infrastructure/Auth/hmac-project-service.authenticator.ts'
import { IndexManifestController } from '../../../src/Interfaces/Http/Controllers/index-manifest.controller.ts'
import { createGlobalValidationPipe } from '../../../src/Interfaces/Http/Pipes/create-global-validation-pipe.ts'
import type { IndexManifestResource } from '../../../src/Interfaces/Http/Resources/index-manifest.resource.ts'
import { createKnowledgeServiceConfigFixture } from '../../Support/knowledge-service-config.fixture.ts'
import { createManifestUseCase, manifestFixture } from '../../Unit/Application/load-index-manifest.fixture.ts'

const secret = 'manifest-test-secret-long-enough'
let manifestSnapshotFixture = manifestFixture(105)
let requests = 0

@Module({
  controllers: [IndexManifestController],
  providers: [
    {
      provide: ServiceAuthenticator,
      useValue: new HmacProjectServiceAuthenticator(createKnowledgeServiceConfigFixture({ serviceAuthSecret: secret })),
    },
    {
      provide: LoadIndexManifestUseCase,
      useValue: {
        execute: async (request: { projectId: string }) => {
          requests += 1

          return createManifestUseCase(manifestSnapshotFixture).useCase.execute(request)
        },
      },
    },
  ],
})
class IndexManifestHttpTestModule {}

const signedHeaders = (path: string, projectId: string) => {
  const issuedAt = String(Date.now())

  return {
    'x-rag-project-id': projectId,
    'x-rag-issued-at': issuedAt,
    'x-rag-signature': createHmac('sha256', secret)
      .update(['GET', path, issuedAt, projectId, createHash('sha256').update('{}').digest('hex')].join('\n'))
      .digest('hex'),
  }
}

test('manifest HTTP binds authentication to the project and returns complete whitelisted version metadata', async () => {
  const app = await NestFactory.create(IndexManifestHttpTestModule, { logger: false })
  app.useGlobalPipes(createGlobalValidationPipe())
  try {
    await app.listen(0, '127.0.0.1')
    const url = await app.getUrl()
    const path = '/v1/projects/project/index-manifest'
    assert.equal((await fetch(`${url}${path}`)).status, 401)
    assert.equal((await fetch(`${url}${path}`, { headers: signedHeaders(path, 'other-project') })).status, 401)
    assert.equal(requests, 0)
    const response = await fetch(`${url}${path}`, { headers: signedHeaders(path, 'project') })
    assert.equal(response.status, 200)
    const body = (await response.json()) as ReturnType<typeof IndexManifestResource.fromKnowledgeBase>
    assert.deepEqual(Object.keys(body).sort(), [
      'activeIndexDigest',
      'complete',
      'consistency',
      'documents',
      'projectId',
      'readyDocuments',
      'schemaVersion',
      'scope',
      'totalDocuments',
    ])
    assert.equal(body.projectId, 'project')
    assert.equal(body.schemaVersion, 1)
    assert.equal(body.scope, 'knowledge_base_memberships')
    assert.equal(body.consistency, 'repeatable_read')
    assert.equal(body.complete, true)
    assert.equal(body.totalDocuments, 105)
    assert.equal(body.documents.length, 105)
    assert.equal(body.readyDocuments, 105)
    assert.equal(body.activeIndexDigest.algorithm, 'sha256')
    assert.equal(body.activeIndexDigest.version, 1)
    assert.match(body.activeIndexDigest.value, /^[a-f0-9]{64}$/)
    const document = body.documents[0]!
    assert.deepEqual(Object.keys(document).sort(), [
      'activeDocumentIndexId',
      'activeIndex',
      'alwaysIncludeFullContent',
      'documentId',
      'isEntry',
      'issues',
      'requestedGeneration',
      'sourceKey',
      'sourcePath',
      'sourceType',
      'title',
    ])
    assert.deepEqual(Object.keys(document.activeIndex!).sort(), [
      'contentSha256',
      'documentIndexId',
      'pipelineHash',
      'profile',
      'readyAt',
      'revisionId',
      'status',
    ])
    assert.deepEqual(document.activeIndex?.profile, {
      chunkingModel: 'chunker',
      chunkingProfile: 'chunk-v1',
      embeddingModel: 'embedder',
      embeddingDimensions: 384,
      embeddingProfile: 'embed-v1',
      lexicalProfile: 'lex-v1',
      relationProfile: 'relation-v1',
    })
    assert.equal(document.requestedGeneration, '9007199254740993')
    assert.ok(!JSON.stringify(body).includes('PRIVATE CONTENT'))
    manifestSnapshotFixture = manifestFixture(0)
    const empty = await fetch(`${url}${path}`, { headers: signedHeaders(path, 'project') })
    assert.equal(empty.status, 200)
    assert.equal(((await empty.json()) as typeof body).totalDocuments, 0)
    manifestSnapshotFixture = { ...manifestFixture(), knowledgeBaseId: null }
    assert.equal((await fetch(`${url}${path}`, { headers: signedHeaders(path, 'project') })).status, 404)
  } finally {
    await app.close()
  }
})
