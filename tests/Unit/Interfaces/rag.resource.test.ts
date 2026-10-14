import assert from 'node:assert/strict'
import test from 'node:test'

import { RagJobStatusDto } from '../../../src/Application/KnowledgeBases/DataTransferObjects/rag.dto.js'
import { RagExecutionStageEnum } from '../../../src/Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { RagJobTargetStateEnum } from '../../../src/Domain/Knowledge/Enums/rag-job-target-state.enum.js'
import { RagRelationResolutionEnum } from '../../../src/Domain/Knowledge/Enums/rag-relation-resolution.enum.js'
import { RagRelationType } from '../../../src/Domain/Knowledge/Enums/rag-relation-type.enum.js'
import { RagSourceTypeEnum } from '../../../src/Domain/Knowledge/Enums/rag-source-type.enum.js'
import {
  HybridRetrievalResource,
  PruneMembershipsResource,
  RagIndexRequestResource,
  RagJobStatusResource,
  RetryFailedJobResource,
} from '../../../src/Interfaces/Http/Resources/rag.resource.js'

test('job status resource preserves declared fields and omits undeclared data', () => {
  const executionVerification = {
    stage: RagExecutionStageEnum.EMBEDDING,
    completedUnits: 2,
    totalUnits: 4,
    verifiedAt: null,
    claimToken: 'claim-token',
    leaseExpiresAt: '2026-10-14T00:01:00.000Z',
    internalVerificationData: 'hidden',
  }
  const requestedTarget = {
    indexId: 'index-1',
    generation: 'generation-1',
    state: RagJobTargetStateEnum.RUNNING,
    jobId: 'job-1',
    failedJobId: null,
    attempts: 2,
    errorCode: null,
    errorMessage: null,
    executionVerification,
    internalTargetData: 'hidden',
  }
  const result = {
    activeIndex: null,
    requestedTarget,
    internalStatusData: 'hidden',
  } satisfies RagJobStatusDto & { internalStatusData: string }

  assert.deepEqual(RagJobStatusResource.from(result), {
    activeIndex: null,
    requestedTarget: {
      indexId: 'index-1',
      generation: 'generation-1',
      state: RagJobTargetStateEnum.RUNNING,
      jobId: 'job-1',
      failedJobId: null,
      attempts: 2,
      errorCode: null,
      errorMessage: null,
      executionVerification: {
        stage: RagExecutionStageEnum.EMBEDDING,
        completedUnits: 2,
        totalUnits: 4,
        verifiedAt: null,
        claimToken: 'claim-token',
        leaseExpiresAt: '2026-10-14T00:01:00.000Z',
      },
    },
  })
})

test('job status resource preserves nulls and omits undefined optional fields', () => {
  const result: RagJobStatusDto = {
    activeIndex: null,
    requestedTarget: {
      indexId: 'index-2',
      generation: 'generation-2',
      state: RagJobTargetStateEnum.QUEUED,
      jobId: null,
      failedJobId: null,
      attempts: null,
      errorCode: null,
      errorMessage: null,
      executionVerification: {
        stage: RagExecutionStageEnum.CLAIMED,
        completedUnits: 0,
        totalUnits: null,
        verifiedAt: null,
        leaseExpiresAt: null,
      },
    },
  }

  Object.defineProperty(result.requestedTarget?.executionVerification, 'claimToken', {
    value: undefined,
    enumerable: true,
  })

  const resource = RagJobStatusResource.from(result)

  assert.deepEqual(resource, {
    activeIndex: null,
    requestedTarget: {
      indexId: 'index-2',
      generation: 'generation-2',
      state: RagJobTargetStateEnum.QUEUED,
      jobId: null,
      failedJobId: null,
      attempts: null,
      errorCode: null,
      errorMessage: null,
      executionVerification: {
        stage: RagExecutionStageEnum.CLAIMED,
        completedUnits: 0,
        totalUnits: null,
        verifiedAt: null,
        leaseExpiresAt: null,
      },
    },
  })
  assert.equal(Object.hasOwn(resource.requestedTarget?.executionVerification ?? {}, 'claimToken'), false)
})

test('job status resource preserves a null execution verification', () => {
  const result: RagJobStatusDto = {
    activeIndex: null,
    requestedTarget: {
      indexId: 'index-3',
      generation: 'generation-3',
      state: RagJobTargetStateEnum.FAILED,
      jobId: null,
      failedJobId: 'failed-3',
      attempts: 1,
      errorCode: 'failed',
      errorMessage: 'failed message',
      executionVerification: null,
    },
  }

  assert.equal(RagJobStatusResource.from(result).requestedTarget?.executionVerification, null)
})

test('retrieval resource whitelists every nested boundary while preserving nullable context and relations', () => {
  const expected: Parameters<typeof HybridRetrievalResource.from>[0] = {
    matches: [
      {
        chunk: {
          id: 'chunk-1',
          projectId: 'project-1',
          documentReference: 'repository:docs/reference.md',
          documentTitle: null,
          source: RagSourceTypeEnum.REPOSITORY,
          contentVersion: 'version-1',
          isEffective: true,
          heading: null,
          chunkIndex: 1,
          totalChunks: 2,
          headingPath: ['Reference'],
          content: 'content',
          tokenCount: null,
          indexedAt: '2026-10-14T00:00:00.000Z',
          chunkingStrategyId: 'markdown-v1',
          startBlock: 1,
          embeddingModelId: 'model-1',
          embeddingVector: [0.1, 0.2],
          activeDocumentIndexId: 'index-1',
          documentRevisionId: 'revision-1',
          searchVector: ['reference'],
          prevChunkReference: 'repository:docs/reference.md#chunk-0',
          nextChunkReference: null,
        },
        neighboringContext: {
          prevChunk: { chunkIndex: 0, heading: 'Reference', content: 'before', reference: 'chunk-0' },
          nextChunk: null,
        },
        matchType: 'hybrid',
        semanticRank: 1,
        lexicalRank: null,
        rawSemanticScore: 0.8,
        rawLexicalScore: null,
        relations: [
          {
            relationId: 'relation-1',
            relationType: RagRelationType.MARKDOWN_LINK,
            sourceIndexId: 'index-1',
            sourceDocumentReference: 'repository:docs/reference.md',
            targetDocumentReference: 'repository:docs/target.md',
            targetAnchor: null,
            targetDocumentId: null,
            evidenceBlockStart: 1,
            evidenceBlockEnd: 1,
            evidenceText: '[target](target.md)',
            resolution: RagRelationResolutionEnum.MISSING,
            candidateCount: 0,
          },
        ],
        score: 0.016,
        rank: 1,
        isMandatoryContext: false,
      },
    ],
    fullContentDocuments: [
      {
        projectId: 'project-1',
        documentReference: 'obsidian:entry.md',
        documentTitle: 'Entry',
        source: RagSourceTypeEnum.OBSIDIAN,
        contentVersion: 'version-2',
        documentRevisionId: 'revision-2',
        content: 'full content',
      },
    ],
  }
  const result = structuredClone(expected)
  const match = result.matches[0]!
  Object.assign(result, { internalData: 'hidden' })
  Object.assign(match, { internalData: 'hidden' })
  Object.assign(match.chunk, { internalData: 'hidden' })
  Object.assign(match.neighboringContext, { internalData: 'hidden' })
  Object.assign(match.neighboringContext.prevChunk!, { internalData: 'hidden' })
  Object.assign(match.relations[0]!, { internalData: 'hidden' })
  Object.assign(result.fullContentDocuments[0]!, { internalData: 'hidden' })

  const resource = HybridRetrievalResource.from(result)

  assert.deepEqual(resource, expected)
  assert.notEqual(resource.matches[0]!.chunk.headingPath, match.chunk.headingPath)
  assert.notEqual(resource.matches[0]!.chunk.embeddingVector, match.chunk.embeddingVector)
  assert.notEqual(resource.matches[0]!.chunk.searchVector, match.chunk.searchVector)
})

test('index, retry, and prune resources preserve status results and omit undeclared fields', () => {
  const indexResult = {
    documentId: 'document-1',
    revisionId: 'revision-1',
    documentIndexId: 'index-1',
    jobId: null,
    generation: 1,
    reusedReadyIndex: true,
    blockedByFailedJob: false,
    internalData: 'hidden',
  }
  const retryResult = {
    jobId: 'job-2',
    failedJobId: 'failed-1',
    status: RagJobTargetStateEnum.QUEUED,
    retryOfFailedJobId: 'failed-1',
    internalData: 'hidden',
  }

  assert.deepEqual(RagIndexRequestResource.from(indexResult), {
    documentId: 'document-1',
    revisionId: 'revision-1',
    documentIndexId: 'index-1',
    jobId: null,
    generation: 1,
    reusedReadyIndex: true,
    blockedByFailedJob: false,
  })
  assert.deepEqual(RetryFailedJobResource.from(retryResult), {
    jobId: 'job-2',
    failedJobId: 'failed-1',
    status: RagJobTargetStateEnum.QUEUED,
    retryOfFailedJobId: 'failed-1',
  })
  const pruneResult = { pruned: 2, internalData: 'hidden' }

  assert.deepEqual(PruneMembershipsResource.from(pruneResult), { pruned: 2 })
})
