import 'reflect-metadata'

import assert from 'node:assert/strict'
import test from 'node:test'

import { validateSync } from 'class-validator'

import { RagSourceTypeEnum } from '../../../src/Domain/Knowledge/Enums/rag-source-type.enum.js'
import {
  HybridRetrieveRequest,
  PruneMembershipsRequest,
  RagSourceDocumentRequest,
} from '../../../src/Interfaces/Http/Requests/rag.request.js'

test('prune request assembles its validated body with the route knowledge-base id', () => {
  const request = Object.assign(new PruneMembershipsRequest(), {
    projectId: 'project-1',
    documentIds: ['document-1', 'document-2'],
  })

  assert.deepEqual(request.toDTO('knowledge-base-1'), {
    projectId: 'project-1',
    knowledgeBaseId: 'knowledge-base-1',
    documentIds: ['document-1', 'document-2'],
  })
})

test('hybrid retrieve request rejects an empty project id', () => {
  const request = Object.assign(new HybridRetrieveRequest(), {
    projectId: '',
    queryText: 'query',
  })

  assert.ok(validateSync(request).some((error) => error.property === 'projectId'))
})

test('index request accepts declared source enums and rejects unknown values', () => {
  const request = Object.assign(new RagSourceDocumentRequest(), {
    knowledgeBaseId: '11111111-1111-4111-8111-111111111111',
    projectId: 'project-1',
    projectName: 'Project',
    sourceType: RagSourceTypeEnum.REPOSITORY,
    sourceKey: 'repository-1',
    sourcePath: 'README.md',
    content: 'content',
  })

  assert.deepEqual(validateSync(request), [])
  request.sourceType = RagSourceTypeEnum.OBSIDIAN
  assert.deepEqual(validateSync(request), [])
  Object.assign(request, { sourceType: 'unsupported' })
  assert.ok(validateSync(request).some((error) => error.property === 'sourceType'))
})

test('optional retrieval fields reject null instead of bypassing their declared validation', () => {
  const request = Object.assign(new HybridRetrieveRequest(), {
    projectId: 'project-1',
    queryText: 'query',
    queryVector: null,
    embeddingModelId: null,
    topK: null,
    limit: null,
    documentReference: null,
    includeNonEffective: null,
  })

  assert.deepEqual(
    validateSync(request)
      .map((error) => error.property)
      .sort(),
    ['documentReference', 'embeddingModelId', 'includeNonEffective', 'limit', 'queryVector', 'topK'],
  )
})

test('index optional fields reject null and omit undeclared request fields from its DTO', () => {
  const request = Object.assign(new RagSourceDocumentRequest(), {
    knowledgeBaseId: '11111111-1111-4111-8111-111111111111',
    projectId: 'project-1',
    projectName: 'Project',
    sourceType: RagSourceTypeEnum.REPOSITORY,
    sourceKey: 'repository-1',
    sourcePath: 'README.md',
    content: 'content',
    internalField: 'hidden',
  })

  assert.equal(Object.hasOwn(request.toDTO(), 'internalField'), false)
  Object.assign(request, { title: null, payload: null, isEntry: null, alwaysIncludeFullContent: null })
  assert.deepEqual(
    validateSync(request)
      .map((error) => error.property)
      .sort(),
    ['alwaysIncludeFullContent', 'isEntry', 'payload', 'title'],
  )
})
