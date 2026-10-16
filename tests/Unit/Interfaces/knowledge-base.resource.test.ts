import assert from 'node:assert/strict'
import test from 'node:test'

import { DocumentIndexingStatusDto } from '../../../src/Application/DocumentIndexes/DataTransferObjects/document-indexing-status.dto.ts'
import { DocumentIndexExecutionStageEnum } from '../../../src/Application/DocumentIndexes/Enums/document-index-execution-stage.enum.ts'
import { DocumentIndexingTargetStateEnum } from '../../../src/Application/DocumentIndexes/Enums/document-indexing-target-state.enum.ts'
import { RetrievalKnowledgeBaseContentAssembler } from '../../../src/Application/KnowledgeBases/Assemblers/retrieval-knowledge-base-content.assembler.ts'
import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { DocumentRelation } from '../../../src/Domain/DocumentRelation/document-relation.ts'
import { DocumentRelationResolutionEnum } from '../../../src/Domain/DocumentRelation/Enums/document-relation-resolution.enum.ts'
import { DocumentRelationTypeEnum } from '../../../src/Domain/DocumentRelation/Enums/document-relation-type.enum.ts'
import { DocumentIndexRequestResource } from '../../../src/Interfaces/Http/Resources/document-index-request.resource.ts'
import { DocumentIndexingStatusResource } from '../../../src/Interfaces/Http/Resources/document-indexing-status.resource.ts'
import { HybridKnowledgeRetrievalResource } from '../../../src/Interfaces/Http/Resources/hybrid-knowledge-retrieval.resource.ts'
import { PruneKnowledgeBaseMembershipsResource } from '../../../src/Interfaces/Http/Resources/prune-knowledge-base-memberships.resource.ts'
import { RetryDocumentIndexingResource } from '../../../src/Interfaces/Http/Resources/retry-document-indexing.resource.ts'
import { createRestoredMembershipFixture } from '../Application/document-index-lifecycle.fixture.ts'
import { createRetrievalKnowledgeBaseContentInputFixture } from '../Application/retrieval-knowledge-base-content.fixture.ts'
import { createRetrievalChunkFixture } from '../Application/retrieve-knowledge-base-content.use-case.fixtures.ts'

test('job status resource preserves declared fields and omits undeclared data', () => {
  const executionVerification = {
    stage: DocumentIndexExecutionStageEnum.EMBEDDING,
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
    state: DocumentIndexingTargetStateEnum.RUNNING,
    jobId: 'job-1',
    failedJobId: null,
    attempts: 2,
    errorCode: null,
    errorMessage: null,
    executionVerification,
    internalTargetData: 'hidden',
  }
  const jobStatusDTO = {
    activeIndex: null,
    requestedTarget,
    internalStatusData: 'hidden',
  } satisfies DocumentIndexingStatusDto & { internalStatusData: string }

  assert.deepEqual(DocumentIndexingStatusResource.toDocumentIndexingStatusResource(jobStatusDTO), {
    activeIndex: null,
    requestedTarget: {
      indexId: 'index-1',
      generation: 'generation-1',
      state: DocumentIndexingTargetStateEnum.RUNNING,
      jobId: 'job-1',
      failedJobId: null,
      attempts: 2,
      errorCode: null,
      errorMessage: null,
      executionVerification: {
        stage: DocumentIndexExecutionStageEnum.EMBEDDING,
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
  const jobStatusDTO: DocumentIndexingStatusDto = {
    activeIndex: null,
    requestedTarget: {
      indexId: 'index-2',
      generation: 'generation-2',
      state: DocumentIndexingTargetStateEnum.QUEUED,
      jobId: null,
      failedJobId: null,
      attempts: null,
      errorCode: null,
      errorMessage: null,
      executionVerification: {
        stage: DocumentIndexExecutionStageEnum.CLAIMED,
        completedUnits: 0,
        totalUnits: null,
        verifiedAt: null,
        leaseExpiresAt: null,
      },
    },
  }

  Object.defineProperty(jobStatusDTO.requestedTarget?.executionVerification, 'claimToken', {
    value: undefined,
    enumerable: true,
  })

  const resource = DocumentIndexingStatusResource.toDocumentIndexingStatusResource(jobStatusDTO)

  assert.deepEqual(resource, {
    activeIndex: null,
    requestedTarget: {
      indexId: 'index-2',
      generation: 'generation-2',
      state: DocumentIndexingTargetStateEnum.QUEUED,
      jobId: null,
      failedJobId: null,
      attempts: null,
      errorCode: null,
      errorMessage: null,
      executionVerification: {
        stage: DocumentIndexExecutionStageEnum.CLAIMED,
        completedUnits: 0,
        totalUnits: null,
        verifiedAt: null,
        leaseExpiresAt: null,
      },
    },
  })
  assert.equal(Object.hasOwn(resource.requestedTarget?.executionVerification ?? {}, 'claimToken'), false)
  assert.deepEqual(JSON.parse(JSON.stringify(resource)), resource)
})

test('job status resource preserves a null execution verification', () => {
  const jobStatusDTO: DocumentIndexingStatusDto = {
    activeIndex: null,
    requestedTarget: {
      indexId: 'index-3',
      generation: 'generation-3',
      state: DocumentIndexingTargetStateEnum.FAILED,
      jobId: null,
      failedJobId: 'failed-3',
      attempts: 1,
      errorCode: 'failed',
      errorMessage: 'failed message',
      executionVerification: null,
    },
  }

  const resource = DocumentIndexingStatusResource.toDocumentIndexingStatusResource(jobStatusDTO)

  assert.equal(resource.requestedTarget?.executionVerification, null)
  assert.deepEqual(JSON.parse(JSON.stringify(resource)), resource)
})

test('job status resource serializes an active index date and a null requested target', () => {
  const jobStatusDTO: DocumentIndexingStatusDto = {
    activeIndex: {
      id: 'index-1',
      status: DocumentIndexStatusEnum.READY,
      readyAt: new Date('2026-10-14T00:00:00.000Z'),
    },
    requestedTarget: null,
  }
  Object.assign(jobStatusDTO.activeIndex!, { internalData: 'hidden' })

  assert.deepEqual(
    JSON.parse(JSON.stringify(DocumentIndexingStatusResource.toDocumentIndexingStatusResource(jobStatusDTO))),
    {
      activeIndex: { id: 'index-1', status: DocumentIndexStatusEnum.READY, readyAt: '2026-10-14T00:00:00.000Z' },
      requestedTarget: null,
    },
  )
})

test('retrieval resource whitelists entity and evidence boundaries, preserving dates, nulls and revision titles', () => {
  const facts = createRetrievalKnowledgeBaseContentInputFixture()
  const chunk = facts.snapshot.chunks[0]!
  const previousChunk = createRetrievalChunkFixture({
    id: 'chunk-previous',
    documentIndexId: 'index-1',
    ordinal: 1,
    headingPath: [],
    content: 'Before.',
  })
  facts.neighboringChunksById.set(chunk.id, { previousChunk, nextChunk: null })
  facts.vectorRanked = [{ chunk, semanticScore: 0, semanticRank: 1, lexicalScore: 0, lexicalRank: null }]
  const relation = new DocumentRelation({
    id: 'relation-1',
    sourceIndexId: 'index-1',
    targetDocumentId: null,
    targetReference: 'other.md',
    targetAnchor: null,
    relationType: DocumentRelationTypeEnum.MARKDOWN_LINK,
    evidenceBlockStart: 4,
    evidenceBlockEnd: 4,
    evidenceText: '[other](other.md)',
  })
  facts.snapshot.relations.push(relation)
  facts.relationResolutionById.set(relation.id, {
    targetAnchor: null,
    targetDocumentId: null,
    resolution: DocumentRelationResolutionEnum.MISSING,
    candidateCount: 0,
  })
  const knowledgeBase = facts.snapshot.knowledgeBase!
  const evidence = RetrievalKnowledgeBaseContentAssembler.toRetrievalEvidence(facts, [0.25], 'install')
  Object.assign(evidence.matches[0]!, { internalData: 'hidden' })
  Object.assign(evidence.matches[0]!.relations[0]!, { internalData: 'hidden' })
  Object.assign(evidence.matches[0]!.relations[0]!.resolution, { internalData: 'hidden' })
  knowledgeBase.recordRetrieval(evidence)
  const match = knowledgeBase.retrieval!.matches[0]!
  Object.assign(knowledgeBase, { internalData: 'hidden' })
  Object.assign(chunk, { internalData: 'hidden' })
  Object.assign(previousChunk, { internalData: 'hidden' })
  Object.assign(relation, { internalData: 'hidden' })
  Object.assign(match.revision, { internalData: 'hidden' })

  const expected = {
    matches: [
      {
        chunk: {
          id: 'chunk-1',
          projectId: 'project',
          documentReference: 'guide.md',
          documentTitle: 'Guide',
          source: DocumentSourceTypeEnum.OBSIDIAN,
          contentVersion: `sha256:${'a'.repeat(64)}`,
          isEffective: true,
          heading: 'Setup',
          chunkIndex: 2,
          totalChunks: 8,
          headingPath: ['Setup'],
          content: 'Install the package.',
          tokenCount: null,
          indexedAt: '2026-10-01T00:00:00.000Z',
          chunkingStrategyId: 'markdown-v1',
          startBlock: 4,
          embeddingModelId: 'embedding-v1',
          embeddingVector: [0.25],
          activeDocumentIndexId: 'index-1',
          documentRevisionId: 'revision-1',
          searchVector: ['install'],
          prevChunkReference: 'chunk-previous',
          nextChunkReference: null,
        },
        neighboringContext: {
          prevChunk: { chunkIndex: 1, heading: null, content: 'Before.', reference: 'chunk-previous' },
          nextChunk: null,
        },
        matchType: 'hybrid',
        semanticRank: 1,
        lexicalRank: null,
        rawSemanticScore: 0,
        rawLexicalScore: null,
        relations: [
          {
            relationId: 'relation-1',
            relationType: DocumentRelationTypeEnum.MARKDOWN_LINK,
            sourceIndexId: 'index-1',
            sourceDocumentReference: 'guide.md',
            targetDocumentReference: 'other.md',
            targetAnchor: null,
            targetDocumentId: null,
            evidenceBlockStart: 4,
            evidenceBlockEnd: 4,
            evidenceText: '[other](other.md)',
            resolution: DocumentRelationResolutionEnum.MISSING,
            candidateCount: 0,
          },
        ],
        score: 0.8,
        rank: 1,
        isMandatoryContext: true,
      },
    ],
    fullContentDocuments: [
      {
        projectId: 'project',
        documentReference: 'guide.md',
        documentTitle: 'Guide',
        source: DocumentSourceTypeEnum.OBSIDIAN,
        contentVersion: `sha256:${'a'.repeat(64)}`,
        documentRevisionId: 'revision-1',
        content: 'Guide content',
      },
    ],
  }
  const resource = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(knowledgeBase)

  assert.deepEqual(resource, expected)
  assert.deepEqual(JSON.parse(JSON.stringify(resource)), expected)
  assert.notEqual(resource.matches[0]!.chunk.headingPath, chunk.headingPath)
  assert.notEqual(resource.matches[0]!.chunk.embeddingVector, chunk.embedding)
})

test('retrieval resource preserves empty result collections for absent knowledge bases and evidence', () => {
  const expected = { matches: [], fullContentDocuments: [] }
  assert.deepEqual(HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(null), expected)
  assert.deepEqual(
    HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
      createRetrievalKnowledgeBaseContentInputFixture().snapshot.knowledgeBase,
    ),
    expected,
  )
})

test('index, retry, and prune resources preserve status results and omit undeclared fields', () => {
  const indexResult = {
    documentId: 'document-1',
    revisionId: 'revision-1',
    documentIndexId: 'index-1',
    jobId: null,
    generation: 'generation-1',
    reusedReadyIndex: true,
    blockedByFailedJob: false,
    internalData: 'hidden',
  }
  const retryResult = {
    jobId: 'job-2',
    failedJobId: 'failed-1',
    status: DocumentIndexingTargetStateEnum.QUEUED,
    retryOfFailedJobId: 'failed-1',
    internalData: 'hidden',
  }

  assert.deepEqual(DocumentIndexRequestResource.toDocumentIndexRequestResource(indexResult), {
    documentId: 'document-1',
    revisionId: 'revision-1',
    documentIndexId: 'index-1',
    jobId: null,
    generation: 'generation-1',
    reusedReadyIndex: true,
    blockedByFailedJob: false,
  })
  assert.deepEqual(RetryDocumentIndexingResource.toRetryDocumentIndexingResource(retryResult), {
    jobId: 'job-2',
    failedJobId: 'failed-1',
    status: DocumentIndexingTargetStateEnum.QUEUED,
    retryOfFailedJobId: 'failed-1',
  })
  const pruneResult = [
    createRestoredMembershipFixture({ documentId: 'document-1' }),
    createRestoredMembershipFixture({ documentId: 'document-2' }),
  ]

  assert.deepEqual(PruneKnowledgeBaseMembershipsResource.toPruneKnowledgeBaseMembershipsResource(pruneResult), {
    pruned: 2,
  })
})
