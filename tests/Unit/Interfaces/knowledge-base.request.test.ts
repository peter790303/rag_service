import assert from 'node:assert/strict'
import test from 'node:test'

import { validateSync } from 'class-validator'
import 'reflect-metadata'

import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import { HybridKnowledgeRetrievalRequest } from '../../../src/Interfaces/Http/Requests/hybrid-knowledge-retrieval.request.ts'
import { PruneKnowledgeBaseMembershipsRequest } from '../../../src/Interfaces/Http/Requests/prune-knowledge-base-memberships.request.ts'
import { SourceDocumentIndexRequest } from '../../../src/Interfaces/Http/Requests/source-document-index.request.ts'

test('prune request assembles its validated body with the route knowledge-base id', () => {
  const request = Object.assign(new PruneKnowledgeBaseMembershipsRequest(), {
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
  const request = Object.assign(new HybridKnowledgeRetrievalRequest(), {
    projectId: '',
    queryText: 'query',
  })

  assert.ok(validateSync(request).some((error) => error.property === 'projectId'))
})

test('index request accepts declared source enums and rejects unknown values', () => {
  const request = Object.assign(new SourceDocumentIndexRequest(), {
    knowledgeBaseId: '11111111-1111-4111-8111-111111111111',
    projectId: 'project-1',
    projectName: 'Project',
    sourceType: DocumentSourceTypeEnum.REPOSITORY,
    sourceKey: 'repository-1',
    sourcePath: 'README.md',
    content: 'content',
  })

  assert.deepEqual(validateSync(request), [])
  request.sourceType = DocumentSourceTypeEnum.OBSIDIAN
  assert.deepEqual(validateSync(request), [])
  Object.assign(request, { sourceType: 'unsupported' })
  assert.ok(validateSync(request).some((error) => error.property === 'sourceType'))
})

test('optional retrieval fields reject null instead of bypassing their declared validation', () => {
  const request = Object.assign(new HybridKnowledgeRetrievalRequest(), {
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
  const request = Object.assign(new SourceDocumentIndexRequest(), {
    knowledgeBaseId: '11111111-1111-4111-8111-111111111111',
    projectId: 'project-1',
    projectName: 'Project',
    sourceType: DocumentSourceTypeEnum.REPOSITORY,
    sourceKey: 'repository-1',
    sourcePath: 'README.md',
    content: 'content',
    internalField: 'hidden',
  })

  const expected = {
    knowledgeBaseId: '11111111-1111-4111-8111-111111111111',
    projectId: 'project-1',
    projectName: 'Project',
    sourceType: DocumentSourceTypeEnum.REPOSITORY,
    sourceKey: 'repository-1',
    sourcePath: 'README.md',
    content: 'content',
  }

  assert.deepEqual(request.toDTO(), expected)
  assert.deepEqual(JSON.parse(JSON.stringify(request.toDTO())), expected)
  Object.assign(request, { title: null, payload: null, isEntry: null, alwaysIncludeFullContent: null })
  assert.deepEqual(
    validateSync(request)
      .map((error) => error.property)
      .sort(),
    ['alwaysIncludeFullContent', 'isEntry', 'payload', 'title'],
  )
})

test('index DTO preserves provided empty and false values while omitting undefined optionals', () => {
  const request: SourceDocumentIndexRequest = Object.assign(new SourceDocumentIndexRequest(), {
    knowledgeBaseId: '11111111-1111-4111-8111-111111111111',
    projectId: 'project-1',
    projectName: 'Project',
    sourceType: DocumentSourceTypeEnum.REPOSITORY,
    sourceKey: 'repository-1',
    sourcePath: 'README.md',
    content: 'content',
    title: '',
    payload: {},
    isEntry: false,
    alwaysIncludeFullContent: false,
  })
  const expected = {
    knowledgeBaseId: request.knowledgeBaseId,
    projectId: 'project-1',
    projectName: 'Project',
    sourceType: DocumentSourceTypeEnum.REPOSITORY,
    sourceKey: 'repository-1',
    sourcePath: 'README.md',
    content: 'content',
    title: '',
    payload: {},
    isEntry: false,
    alwaysIncludeFullContent: false,
  }

  assert.deepEqual(request.toDTO(), expected)
  assert.deepEqual(JSON.parse(JSON.stringify(request.toDTO())), expected)

  Object.assign(request, {
    title: undefined,
    payload: undefined,
    isEntry: undefined,
    alwaysIncludeFullContent: undefined,
  })
  const dto = request.toDTO()

  assert.equal(Object.hasOwn(dto, 'title'), false)
  assert.equal(Object.hasOwn(dto, 'payload'), false)
  assert.equal(Object.hasOwn(dto, 'isEntry'), false)
  assert.equal(Object.hasOwn(dto, 'alwaysIncludeFullContent'), false)
})

test('retrieval DTO preserves declared optional values and omits undefined or undeclared fields', () => {
  const request = Object.assign(new HybridKnowledgeRetrievalRequest(), {
    projectId: 'project-1',
    queryText: 'query',
    queryVector: undefined,
    embeddingModelId: undefined,
    topK: undefined,
    limit: undefined,
    documentReference: undefined,
    includeNonEffective: undefined,
    internalField: 'hidden',
  })

  assert.deepEqual(request.toDTO(), { projectId: 'project-1', queryText: 'query' })
  assert.deepEqual(JSON.parse(JSON.stringify(request.toDTO())), { projectId: 'project-1', queryText: 'query' })

  Object.assign(request, {
    queryVector: [0, 1],
    embeddingModelId: '',
    topK: 1,
    limit: 2,
    documentReference: '',
    includeNonEffective: false,
  })
  const expected = {
    projectId: 'project-1',
    queryText: 'query',
    queryVector: [0, 1],
    embeddingModelId: '',
    topK: 1,
    limit: 2,
    documentReference: '',
    includeNonEffective: false,
  }

  assert.deepEqual(request.toDTO(), expected)
  assert.deepEqual(JSON.parse(JSON.stringify(request.toDTO())), expected)
})
