import assert from 'node:assert/strict'
import test from 'node:test'

import { RagIndexRequestAssembler } from '../../../src/Application/KnowledgeBases/Assemblers/rag-index-request.assembler.js'
import type {
  RagIndexRequestInitialMembershipState,
  RagIndexRequestTransaction,
  RagIndexRequestTransactionRepository,
} from '../../../src/Application/KnowledgeBases/Contracts/rag-index-request-transaction.js'
import { RequestRagIndexUseCase } from '../../../src/Application/KnowledgeBases/UseCases/request-rag-index.use-case.js'
import { RAG_INDEX_REQUEST_OUTCOME_KINDS } from '../../../src/Domain/Knowledge/Enums/rag-index-request-outcome-kind.js'
import { RagIndexTargetStateEnum } from '../../../src/Domain/Knowledge/Enums/rag-index-target-state.enum.js'
import { RagSourceTypeEnum } from '../../../src/Domain/Knowledge/Enums/rag-source-type.enum.js'
import { KnowledgeBaseProjectMismatchException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-base-project-mismatch.exception.js'
import { KnowledgeIndexPendingException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-index-pending.exception.js'
import { RAG_JOB_STATUS } from '../../../src/Domain/Knowledge/rag-job.js'
import { RagKnowledgeBase } from '../../../src/Domain/Knowledge/rag-knowledge-base.js'

const pipelineSettings = {
  embeddingModel: 'test-embedding',
  embeddingDimensions: 2,
  chunkingModel: 'markdown-v1',
  chunkingProfile: 'markdown-v1',
  embeddingProfile: 'normalized-v1',
  lexicalProfile: 'lexical-v1',
  relationProfile: 'relations-v1',
}

const source = {
  knowledgeBaseId: 'knowledge-base-1',
  projectId: 'project-1',
  projectName: 'Project',
  sourceType: RagSourceTypeEnum.REPOSITORY,
  sourceKey: 'document-1',
  sourcePath: 'document.md',
  content: 'content',
}

const createRequest = (
  options: {
    indexStatus?: string
    knowledgeBaseProjectId?: string
    knowledgeBaseProjectName?: string
    requestedGeneration?: number
    activeDocumentIndexId?: string | null
    currentJob?: { id: string; documentIndexId: string; generation: number; status: string } | null
    failedGenerations?: number[]
    missingTargetLockAttempts?: number
  } = {},
) => {
  const events: string[] = []
  const failedGenerations = new Set(options.failedGenerations ?? [])
  const targetIndexId = 'index-1'
  const knowledgeBaseEvents: string[] = []
  let transactionCount = 0
  let transactionActive = false
  let targetLockAttempts = 0
  const transaction = {
    lockKnowledgeBase: async () => {
      events.push('lock-knowledge-base')

      return options.knowledgeBaseProjectId === undefined
        ? null
        : RagKnowledgeBase.create({
            id: source.knowledgeBaseId,
            projectId: options.knowledgeBaseProjectId,
            projectName: options.knowledgeBaseProjectName ?? 'Project',
          })
    },
    createKnowledgeBase: async () => {
      events.push('create-knowledge-base')
    },
    saveKnowledgeBase: async (knowledgeBase: RagKnowledgeBase) => {
      knowledgeBaseEvents.push(knowledgeBase.projectName)
      events.push('save-knowledge-base')
    },
    ensureSource: async () => {
      events.push('ensure-source')

      return { documentId: 'document-1' }
    },
    lockDocument: async () => {
      events.push('lock-document')

      return true
    },
    createMembershipIfMissing: async ({ initialState }: { initialState: RagIndexRequestInitialMembershipState }) => {
      events.push(
        `create-membership:${initialState.requestedGeneration}:${initialState.activeDocumentIndexId}:${initialState.isEntry}:${initialState.alwaysIncludeFullContent}`,
      )
    },
    lockMembership: async () => {
      events.push('lock-membership')

      return {
        knowledgeBaseId: source.knowledgeBaseId,
        documentId: 'document-1',
        requestedGeneration: options.requestedGeneration ?? 4,
        activeDocumentIndexId: options.activeDocumentIndexId ?? null,
      }
    },
    updateMembershipOptions: async () => {
      events.push('update-membership-options')
    },
    findOrCreateRevision: async () => {
      events.push('find-or-create-revision')

      return { revisionId: 'revision-1' }
    },
    findOrCreateIndex: async () => {
      events.push('find-or-create-index')

      return {
        id: targetIndexId,
        documentId: 'document-1',
        revisionId: 'revision-1',
        status: options.indexStatus ?? RagIndexTargetStateEnum.BUILDING,
      }
    },
    lockCurrentJob: async () => {
      events.push('lock-current-job')

      return options.currentJob ?? null
    },
    hasUnretriedFailure: async ({ generation }: { generation: number }) => {
      events.push(`check-failure:${generation}`)

      return failedGenerations.has(generation)
    },
    lockIndexesById: async (ids: string[]) => {
      events.push('lock-indexes')
      targetLockAttempts += 1

      if (targetLockAttempts <= (options.missingTargetLockAttempts ?? 0)) return []

      return [...new Set(ids)].map((id) => ({
        id,
        documentId: 'document-1',
        revisionId: id === targetIndexId ? 'revision-1' : 'old-revision',
        status:
          id === targetIndexId
            ? (options.indexStatus ?? RagIndexTargetStateEnum.BUILDING)
            : RagIndexTargetStateEnum.READY,
      }))
    },
    updateMembershipRequest: async ({ requestedGeneration }: { requestedGeneration: number }) => {
      events.push(`update-membership:${requestedGeneration}`)
    },
    removeCurrentJob: async () => {
      events.push('remove-job')
    },
    enqueueJob: async (input: { status: string; attempts: number; availableAt: Date }) => {
      events.push(`enqueue-job:${input.status}:${input.attempts}:${Number.isFinite(input.availableAt.getTime())}`)

      return { jobId: 'queued-job' }
    },
    updateIndexUnreferencedSince: async (documentIndexId: string, value: Date | null) => {
      events.push(`unreferenced:${documentIndexId}:${value === null ? 'clear' : 'set'}`)
    },
  } as unknown as RagIndexRequestTransaction
  const workflow = {
    withTransaction: async <T>(operation: (value: RagIndexRequestTransaction) => Promise<T>) => {
      assert.equal(transactionActive, false, 'target re-preparation transactions must run sequentially')
      transactionActive = true
      transactionCount += 1

      try {
        return await operation(transaction)
      } finally {
        transactionActive = false
      }
    },
  } as RagIndexRequestTransactionRepository
  const useCase = new RequestRagIndexUseCase(
    workflow,
    {
      sha256: (value: string) => `hash:${value}`,
      generateIdempotencyKey: () => 'idempotency-key',
      generateLeaseToken: () => 'lease-token',
    },
    pipelineSettings,
    new RagIndexRequestAssembler(pipelineSettings),
  )

  return {
    execute: () => useCase.execute(source),
    events,
    knowledgeBaseEvents,
    transactionCount: () => transactionCount,
  }
}

test('request indexing updates generation and enqueues within one ordered transaction', async () => {
  const request = createRequest({
    currentJob: {
      id: 'obsolete-job',
      documentIndexId: 'old-index',
      generation: 4,
      status: RAG_JOB_STATUS.QUEUED,
    },
  })

  const result = await request.execute()

  assert.equal(request.transactionCount(), 1)
  assert.equal(result.jobId, 'queued-job')
  assert.equal(result.generation, 5)
  assert.ok(request.events.includes('create-membership:0:null:false:false'))
  assert.ok(request.events.indexOf('lock-document') < request.events.indexOf('lock-membership'))
  assert.ok(request.events.indexOf('lock-membership') < request.events.indexOf('lock-current-job'))
  assert.ok(request.events.indexOf('lock-current-job') < request.events.indexOf('lock-indexes'))
  assert.ok(request.events.indexOf('update-membership:5') < request.events.indexOf('enqueue-job:queued:0:true'))
  assert.equal(request.events.filter((event) => event === 'enqueue-job:queued:0:true').length, 1)
})

test('request indexing rejects a knowledge base assigned to another project before processing the source', async () => {
  const request = createRequest({ knowledgeBaseProjectId: 'different-project' })

  await assert.rejects(request.execute(), KnowledgeBaseProjectMismatchException)

  assert.ok(request.events.includes('lock-knowledge-base'))
  assert.equal(request.events.includes('ensure-source'), false)
})

test('request indexing synchronizes the project name through the knowledge-base entity', async () => {
  const request = createRequest({ knowledgeBaseProjectId: source.projectId, knowledgeBaseProjectName: 'Old name' })

  await request.execute()

  assert.deepEqual(request.knowledgeBaseEvents, ['Project'])
  assert.ok(request.events.includes('save-knowledge-base'))
})

test('request indexing reuses a current target job without enqueueing another job', async () => {
  const request = createRequest({
    currentJob: {
      id: 'same-target-job',
      documentIndexId: 'index-1',
      generation: 4,
      status: RAG_JOB_STATUS.QUEUED,
    },
  })

  const result = await request.execute()

  assert.equal(result.jobId, 'same-target-job')
  assert.equal(result.generation, 4)
  assert.equal(request.events.includes('enqueue-job'), false)
})

test('request indexing blocks a generation with an unretried failure', async () => {
  const request = createRequest({ failedGenerations: [4] })

  const result = await request.execute()

  assert.equal(result.jobId, null)
  assert.equal(result.generation, 4)
  assert.equal(result.blockedByFailedJob, true)
  assert.equal(request.events.includes('enqueue-job'), false)
})

test('request indexing activates a ready index and retires the prior membership target', async () => {
  const request = createRequest({
    indexStatus: RagIndexTargetStateEnum.READY,
    activeDocumentIndexId: 'old-index',
    currentJob: {
      id: 'old-job',
      documentIndexId: 'old-index',
      generation: 4,
      status: RAG_JOB_STATUS.QUEUED,
    },
  })

  const result = await request.execute()

  assert.equal(result.documentIndexId, 'index-1')
  assert.equal(result.reusedReadyIndex, true)
  assert.equal(result.generation, 5)
  assert.ok(request.events.includes('remove-job'))
  assert.ok(request.events.includes('unreferenced:index-1:clear'))
  assert.ok(request.events.some((event) => event.startsWith('unreferenced:old-index:set')))
  assert.equal(request.events.includes('enqueue-job'), false)
})

test('request indexing re-prepares after the target index disappears before its lock', async () => {
  const request = createRequest({ missingTargetLockAttempts: 1 })

  const result = await request.execute()

  assert.equal(request.transactionCount(), 2)
  assert.equal(result.jobId, 'queued-job')
  assert.equal(request.events.filter((event) => event === 'lock-indexes').length, 2)
  assert.equal(request.events.filter((event) => event.startsWith('enqueue-job:')).length, 1)
})

test('request indexing stops after the bounded target re-preparation attempts', async () => {
  const request = createRequest({ missingTargetLockAttempts: 3 })

  await assert.rejects(request.execute(), KnowledgeIndexPendingException)

  assert.equal(request.transactionCount(), 3)
  assert.equal(request.events.filter((event) => event === 'lock-indexes').length, 3)
  assert.equal(
    request.events.some((event) => event.startsWith('enqueue-job:')),
    false,
  )
})

test('request outcome and target state values retain their discriminated domain meanings', () => {
  assert.equal(RAG_INDEX_REQUEST_OUTCOME_KINDS.enqueue, 'enqueue')
  assert.equal(RagIndexTargetStateEnum.FAILED_BLOCKED, 'failed-blocked')
})
