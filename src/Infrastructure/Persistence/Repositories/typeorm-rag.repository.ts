import { createHash } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Not, Repository } from 'typeorm'

import { RagIndexingStore, type ClaimedRagIndexJob, type RagJobProgress } from './Contracts/rag-indexing-store.js'
import {
  RagFailedJobRetryStore,
  RagJobStatusReader,
  type RetryContext,
  type RetryFailedJobAtomicallyInput,
  type RetryFailedJobAtomicallyResult,
} from './Contracts/rag-job-management.js'
import {
  GarbageCollectionTransaction,
  MembershipPruneTransaction,
  RagGarbageCollectionStore,
  RagMembershipPruningStore,
  type GarbageIndexCandidate,
  type MembershipPruneJob,
  type MembershipPruneRecord,
} from './Contracts/rag-retention-store.js'
import {
  RagRetrievalStore,
  type HybridCandidate,
  type HybridSnapshotResult,
  type RetrievalChunk,
  type RetrievalSnapshot,
} from './Contracts/rag-retrieval-store.js'
import { packRetryPayload, unpackRetryPayload } from './rag-retry-payload.js'
import { TypeOrmRagDocumentIndexRepository } from './typeorm-rag-document-index.repository.js'
import { TypeOrmRagDocumentRevisionRepository } from './typeorm-rag-document-revision.repository.js'
import { TypeOrmRagDocumentRepository } from './typeorm-rag-document.repository.js'
import { TypeOrmRagFailedJobRepository } from './typeorm-rag-failed-job.repository.js'
import { TypeOrmRagJobRepository } from './typeorm-rag-job.repository.js'
import { TypeOrmRagKnowledgeBaseRepository } from './typeorm-rag-knowledge-base.repository.js'
import { TypeOrmRagMembershipRepository } from './typeorm-rag-membership.repository.js'
import { RAG_CONFIG, type RagConfig } from '../../../../config/rag.config.js'
import { EmbeddingProvider } from '../../../Application/KnowledgeBases/Contracts/embedding-provider.js'
import type {
  HybridRetrieveDto,
  PreparedRagIndexRequest,
  RagIndexRequestResult,
  RagJobStatusDto,
  RagSourceDocumentDto,
} from '../../../Application/KnowledgeBases/DataTransferObjects/rag.dto.js'
import { RagIndexTargetStateEnum } from '../../../Domain/Knowledge/Enums/rag-index-target-state.enum.js'
import { RagSourceTypeEnum } from '../../../Domain/Knowledge/Enums/rag-source-type.enum.js'
import { KnowledgeIndexPendingException } from '../../../Domain/Knowledge/Exceptions/knowledge-index-pending.exception.js'
import { MarkdownChunkFactory, type MarkdownPlan } from '../../../Domain/Knowledge/markdown-chunk.factory.js'
import { LEXICAL_PROFILE_VERSION } from '../../../Domain/Knowledge/ValueObjects/lexical-profile.js'
import { calculateRagPipelineHash } from '../../../Domain/Knowledge/ValueObjects/rag-pipeline-hash.js'
import { RagDocumentIndexModel } from '../../../Infrastructure/Persistence/Models/rag-document-index.model.js'

const sha256Hex = (text: string): string => createHash('sha256').update(text).digest('hex')
@Injectable()
export class TypeOrmRagRepository
  implements
    RagIndexingStore,
    RagRetrievalStore,
    RagJobStatusReader,
    RagFailedJobRetryStore,
    RagMembershipPruningStore,
    RagGarbageCollectionStore
{
  constructor(
    @InjectRepository(RagDocumentIndexModel) private readonly indexes: Repository<RagDocumentIndexModel>,
    private readonly embeddingProvider: EmbeddingProvider,
    @Inject(RAG_CONFIG) private readonly config: RagConfig,
    private readonly jobRepository: TypeOrmRagJobRepository,
    private readonly membershipRepository: TypeOrmRagMembershipRepository,
    private readonly documentIndexRepository: TypeOrmRagDocumentIndexRepository,
    private readonly knowledgeBaseRepository: TypeOrmRagKnowledgeBaseRepository,
    private readonly documentRepository: TypeOrmRagDocumentRepository,
    private readonly documentRevisionRepository: TypeOrmRagDocumentRevisionRepository,
    private readonly failedJobRepository: TypeOrmRagFailedJobRepository,
  ) {}

  async prepareIndexRequest(input: RagSourceDocumentDto): Promise<PreparedRagIndexRequest> {
    const knowledgeBase = await this.knowledgeBaseRepository.ensureProject(
      input.knowledgeBaseId,
      input.projectId,
      input.projectName,
    )
    const document = await this.documentRepository.ensureSource(
      input.sourceType,
      input.sourceKey,
      input.sourcePath,
      input.title,
    )
    let membership = await this.membershipRepository.findForSource(knowledgeBase.id, document.id)

    if (!membership) membership = await this.membershipRepository.createForSource(knowledgeBase.id, document.id)

    if (input.isEntry !== undefined) membership.isEntry = input.isEntry

    if (input.alwaysIncludeFullContent !== undefined)
      membership.alwaysIncludeFullContent = input.alwaysIncludeFullContent

    await this.membershipRepository.saveRequest(membership)

    const contentSha256 = sha256Hex(input.content)
    const chunkingProfile = MarkdownChunkFactory.chunkingProfile
    const embeddingProfile = `mean-pooling-normalized:${this.config.embeddingDimensions}`
    const pipelineHash = calculateRagPipelineHash({
      contentSha256,
      embeddingModel: this.embeddingProvider.modelId,
      embeddingDimensions: this.config.embeddingDimensions,
      chunkingModel: this.config.chunkingModel,
      context: input.payload,
    })
    const prepared = await this.indexes.manager.transaction(async (manager) => {
      const lockedDocument = await this.documentRepository.lockById(manager, document.id)

      if (!lockedDocument) {
        throw new KnowledgeIndexPendingException('Document is no longer available')
      }

      const revision = await this.documentRevisionRepository.findOrCreate(
        manager,
        document.id,
        contentSha256,
        input.title ?? null,
        input.content,
      )
      let index = await this.documentIndexRepository.findByRevisionAndPipeline(manager, revision.id, pipelineHash)

      if (!index) {
        index = await this.documentIndexRepository.createBuildingIndex(manager, {
          documentId: document.id,
          revisionId: revision.id,
          pipelineHash,
          chunkingModel: this.config.chunkingModel,
          chunkingProfile,
          embeddingModel: this.embeddingProvider.modelId,
          embeddingDimensions: this.config.embeddingDimensions,
          embeddingProfile,
          lexicalProfile: LEXICAL_PROFILE_VERSION,
          relationProfile: MarkdownChunkFactory.relationProfile,
        })
      }

      const currentGeneration = Number(membership.requestedGeneration)
      const currentJob = await this.jobRepository.findTarget(
        manager,
        knowledgeBase.id,
        document.id,
        index.id,
        membership.requestedGeneration,
      )
      const failedJob = await this.failedJobRepository.findCurrentUnretried(
        manager,
        knowledgeBase.id,
        document.id,
        index.id,
        membership.requestedGeneration,
      )
      const targetState: PreparedRagIndexRequest['targetState'] =
        index.status === 'ready'
          ? RagIndexTargetStateEnum.READY
          : currentJob
            ? currentJob.status === 'running'
              ? RagIndexTargetStateEnum.BUILDING
              : RagIndexTargetStateEnum.QUEUED
            : failedJob
              ? RagIndexTargetStateEnum.FAILED_BLOCKED
              : RagIndexTargetStateEnum.NEEDS_INDEX

      return {
        documentId: document.id,
        revisionId: revision.id,
        documentIndexId: index.id,
        targetState,
        currentGeneration,
        currentJobId: currentJob?.id ?? null,
        reusedReadyIndex: index.status === 'ready',
      }
    })

    return prepared
  }

  async activateReadyIndex(input: {
    knowledgeBaseId: string
    documentId: string
    documentIndexId: string
    currentGeneration: number
  }): Promise<RagIndexRequestResult> {
    return this.indexes.manager.transaction(async (manager) => {
      const currentMembership = await this.membershipRepository.lockMembership(
        manager,
        input.knowledgeBaseId,
        input.documentId,
      )
      const readyIndex = await this.documentIndexRepository.lockById(manager, input.documentIndexId)

      if (!currentMembership || !readyIndex || readyIndex.status !== 'ready') {
        throw new KnowledgeIndexPendingException('Ready index or membership is no longer available')
      }

      if (Number(currentMembership.requestedGeneration) !== input.currentGeneration) {
        throw new KnowledgeIndexPendingException('Membership generation changed before activation')
      }

      const generation =
        Number(currentMembership.requestedGeneration) +
        (currentMembership.activeDocumentIndexId === readyIndex.id ? 0 : 1)
      const previousIndexId = currentMembership.activeDocumentIndexId
      currentMembership.requestedGeneration = String(generation)
      currentMembership.activeDocumentIndexId = readyIndex.id
      await this.membershipRepository.saveRequestIn(manager, currentMembership)

      if (previousIndexId && previousIndexId !== readyIndex.id) {
        await this.documentIndexRepository.markUnreferenced(manager, previousIndexId)
      }

      return {
        documentId: input.documentId,
        revisionId: readyIndex.revisionId,
        documentIndexId: readyIndex.id,
        jobId: null,
        generation,
        reusedReadyIndex: true,
        blockedByFailedJob: false,
      }
    })
  }

  async enqueueIndex(
    input: RagSourceDocumentDto,
    prepared: PreparedRagIndexRequest,
    generation: number,
  ): Promise<RagIndexRequestResult> {
    return this.indexes.manager.transaction(async (manager) => {
      const currentMembership = await this.membershipRepository.lockMembership(
        manager,
        input.knowledgeBaseId,
        prepared.documentId,
      )

      if (!currentMembership) throw new KnowledgeIndexPendingException('Membership disappeared before enqueue')

      const currentGeneration = Number(currentMembership.requestedGeneration)

      if (currentGeneration !== prepared.currentGeneration) {
        throw new KnowledgeIndexPendingException('Membership generation changed before enqueue')
      }

      const currentJob = await this.jobRepository.findCurrentTarget(manager, input.knowledgeBaseId, prepared.documentId)

      if (
        currentJob &&
        currentJob.documentIndexId === prepared.documentIndexId &&
        Number(currentJob.generation) === currentGeneration
      ) {
        return {
          documentId: prepared.documentId,
          revisionId: prepared.revisionId,
          documentIndexId: prepared.documentIndexId,
          jobId: currentJob.id,
          generation: currentGeneration,
          reusedReadyIndex: false,
          blockedByFailedJob: false,
        }
      }

      const failedTarget = await this.failedJobRepository.findCurrentUnretried(
        manager,
        input.knowledgeBaseId,
        prepared.documentId,
        prepared.documentIndexId,
        String(generation),
      )

      if (failedTarget) {
        return {
          documentId: prepared.documentId,
          revisionId: prepared.revisionId,
          documentIndexId: prepared.documentIndexId,
          jobId: null,
          generation,
          reusedReadyIndex: false,
          blockedByFailedJob: true,
        }
      }

      if (currentJob) await this.jobRepository.remove(manager, currentJob)

      currentMembership.requestedGeneration = String(generation)
      await this.membershipRepository.saveRequestIn(manager, currentMembership)
      const queuedJob = await this.jobRepository.saveQueuedTarget(manager, {
        knowledgeBaseId: input.knowledgeBaseId,
        documentId: prepared.documentId,
        documentIndexId: prepared.documentIndexId,
        generation: String(generation),
        idempotencyKey: null,
        retryOfFailedJobId: null,
        payload: { title: input.title ?? '', content: input.content, payload: input.payload ?? {} },
        executionState: null,
        executionVerification: null,
      })

      return {
        documentId: prepared.documentId,
        revisionId: prepared.revisionId,
        documentIndexId: prepared.documentIndexId,
        jobId: queuedJob.id,
        generation,
        reusedReadyIndex: false,
        blockedByFailedJob: false,
      }
    })
  }

  async heartbeat(job: ClaimedRagIndexJob, progress: RagJobProgress): Promise<void> {
    await this.jobRepository.heartbeat(job, progress)
  }

  async loadSnapshot(input: HybridRetrieveDto): Promise<RetrievalSnapshot> {
    return this.membershipRepository.loadSnapshot(input)
  }

  async loadHybridSnapshot(
    input: HybridRetrieveDto,
    queryVector: number[],
    limits: { vectorLimit: number; lexicalLimit: number },
  ): Promise<HybridSnapshotResult> {
    return this.membershipRepository.loadHybridSnapshot(input, queryVector, limits)
  }

  async findHybridCandidates(
    input: HybridRetrieveDto,
    queryVector: number[],
    activeIndexIds: string[],
    limits: { vectorLimit: number; lexicalLimit: number },
  ): Promise<HybridCandidate[]> {
    return this.membershipRepository.findHybridCandidates(input, queryVector, activeIndexIds, limits)
  }

  async loadCandidateContext(
    input: HybridRetrieveDto,
    selectedChunkIds: string[],
    activeIndexIds: string[],
  ): Promise<RetrievalChunk[]> {
    return this.membershipRepository.loadCandidateContext(input, selectedChunkIds, activeIndexIds)
  }

  async claimNext(): Promise<ClaimedRagIndexJob | null> {
    return this.jobRepository.claimNext()
  }

  async loadContent(documentIndexId: string): Promise<string> {
    return this.documentIndexRepository.loadContent(documentIndexId)
  }

  async jobStatus(projectId: string, id: string): Promise<RagJobStatusDto> {
    return this.jobRepository.jobStatus(projectId, id)
  }

  async savePlan(job: ClaimedRagIndexJob, plan: MarkdownPlan, vectors: number[][]): Promise<void> {
    await this.indexes.manager.transaction(async (manager) => {
      const jobRecord = await this.jobRepository.lockById(manager, job.id)
      this.jobRepository.assertLeaseOwnership(jobRecord, job)
      await this.documentIndexRepository.replacePlan(manager, job.documentIndexId, plan, vectors)
    })
  }

  async complete(job: ClaimedRagIndexJob): Promise<void> {
    await this.indexes.manager.transaction(async (manager) => {
      const jobRecord = await this.jobRepository.lockById(manager, job.id)
      this.jobRepository.assertLeaseOwnership(jobRecord, job)
      const index = await this.documentIndexRepository.lockById(manager, job.documentIndexId)

      if (!index) throw new KnowledgeIndexPendingException('Index disappeared before completion')

      const membershipActivation = await this.membershipRepository.activateIndex(
        manager,
        job.knowledgeBaseId,
        job.documentId,
        index.id,
        job.generation,
      )
      await this.documentIndexRepository.markReady(manager, index.id)

      if (membershipActivation.activated) {
        const previousIndexId = membershipActivation.previousDocumentIndexId

        if (previousIndexId && previousIndexId !== index.id) {
          await this.documentIndexRepository.markUnreferenced(manager, previousIndexId)
        }
      }

      await this.jobRepository.removeClaimed(manager, jobRecord)
    })
  }

  async fail(
    job: ClaimedRagIndexJob,
    error: { errorCode: string; errorMessage: string; retryAt: Date | null; terminal: boolean } | unknown,
  ): Promise<void> {
    await this.indexes.manager.transaction(async (manager) => {
      const jobRecord = await this.jobRepository.lockById(manager, job.id)
      this.jobRepository.assertLeaseOwnership(jobRecord, job)
      jobRecord.reservedAt = null
      jobRecord.leaseToken = null
      jobRecord.executionVerification = null

      const errorCode =
        typeof error === 'object' && error !== null && 'errorCode' in error
          ? String((error as Record<string, unknown>).errorCode)
          : 'INDEXING_FAILED'
      const errorMessage =
        typeof error === 'object' && error !== null && 'errorMessage' in error
          ? String((error as Record<string, unknown>).errorMessage)
          : error instanceof Error
            ? error.message
            : 'indexing failed'
      const isTerminal =
        typeof error === 'object' && error !== null && 'terminal' in error
          ? Boolean((error as Record<string, unknown>).terminal)
          : jobRecord.attempts >= 4
      const retryAt =
        typeof error === 'object' &&
        error !== null &&
        'retryAt' in error &&
        (error as Record<string, unknown>).retryAt instanceof Date
          ? ((error as Record<string, unknown>).retryAt as Date)
          : new Date(Date.now() + Math.min(60_000, 1000 * 2 ** jobRecord.attempts))

      jobRecord.executionState = {
        ...(jobRecord.executionState ?? {}),
        lastError: { code: errorCode, message: errorMessage, failedAt: new Date().toISOString() },
      }

      if (isTerminal || jobRecord.attempts >= 4) {
        await this.failedJobRepository.createAndSave(manager, {
          jobId: jobRecord.id,
          knowledgeBaseId: jobRecord.knowledgeBaseId,
          documentId: jobRecord.documentId,
          documentIndexId: jobRecord.documentIndexId,
          generation: jobRecord.generation,
          attempts: jobRecord.attempts,
          errorCode,
          errorMessage,
          blockedReasons: [],
          retryPayload: packRetryPayload(jobRecord.payload, jobRecord.executionState),
          failedAt: new Date(),
          retriedAt: null,
        })
        await this.jobRepository.removeClaimed(manager, jobRecord)
      } else {
        jobRecord.status = 'queued'
        jobRecord.availableAt = retryAt
        await this.jobRepository.save(manager, jobRecord)
      }
    })
  }

  async readRetryContext(projectId: string, failedJobId: string): Promise<RetryContext | null> {
    return this.indexes.manager.transaction(async (manager) => {
      const failedJob = await this.failedJobRepository.findByIdIn(manager, failedJobId)

      if (!failedJob) return null

      const knowledgeBase = await this.knowledgeBaseRepository.findByIdIn(manager, failedJob.knowledgeBaseId)

      if (!knowledgeBase || knowledgeBase.projectId !== projectId) return null

      const document = await this.documentRepository.findByIdIn(manager, failedJob.documentId)

      if (!document) return null

      const latestRevision = await this.documentRevisionRepository.findLatestForDocument(manager, failedJob.documentId)
      const currentTitle = document.currentTitle
      const membership = await this.membershipRepository.findForSourceIn(
        manager,
        failedJob.knowledgeBaseId,
        failedJob.documentId,
      )
      const documentIndex = await this.documentIndexRepository.findByIdIn(manager, failedJob.documentIndexId)
      const activeJob = await this.jobRepository.findActiveTarget(
        manager,
        failedJob.knowledgeBaseId,
        failedJob.documentId,
      )

      return {
        failedJob: {
          id: failedJob.id,
          knowledgeBaseId: failedJob.knowledgeBaseId,
          documentId: failedJob.documentId,
          documentIndexId: failedJob.documentIndexId,
          generation: Number(failedJob.generation),
          retryOfFailedJobId: null,
          retriedAt: failedJob.retriedAt,
          retryPayload: (failedJob.retryPayload as Record<string, unknown>) ?? {},
        },
        knowledgeBase: {
          id: knowledgeBase.id,
          projectId: knowledgeBase.projectId,
        },
        document: {
          id: document.id,
          latestRevision: latestRevision
            ? {
                id: latestRevision.id,
                contentSha256: latestRevision.contentSha256,
                content: latestRevision.content,
              }
            : null,
        },
        membership: membership
          ? {
              activeDocumentIndexId: membership.activeDocumentIndexId,
              requestedGeneration: Number(membership.requestedGeneration),
            }
          : null,
        documentIndex: documentIndex
          ? {
              id: documentIndex.id,
              documentRevisionId: documentIndex.revisionId,
              pipelineHash: documentIndex.pipelineHash,
              status: documentIndex.status,
              readyAt: documentIndex.readyAt,
            }
          : null,
        activeJob: activeJob
          ? {
              id: activeJob.id,
              status: activeJob.status,
              leaseExpiresAt: activeJob.reservedAt
                ? new Date(activeJob.reservedAt.getTime() + this.config.workerLeaseSeconds * 1000)
                : null,
            }
          : null,
        currentSource:
          latestRevision &&
          (document.sourceType === RagSourceTypeEnum.OBSIDIAN || document.sourceType === RagSourceTypeEnum.REPOSITORY)
            ? {
                knowledgeBaseId: knowledgeBase.id,
                projectId,
                projectName: knowledgeBase.projectName,
                sourceType: document.sourceType,
                sourceKey: document.sourceKey,
                sourcePath: document.sourcePath,
                ...(currentTitle === null ? {} : { title: currentTitle }),
                content: latestRevision.content,
                payload:
                  (unpackRetryPayload(failedJob.retryPayload).input.payload as Record<string, unknown> | undefined) ??
                  {},
                isEntry: membership?.isEntry ?? false,
                alwaysIncludeFullContent: membership?.alwaysIncludeFullContent ?? false,
              }
            : null,
      }
    })
  }

  async retryFailedJobAtomically(input: RetryFailedJobAtomicallyInput): Promise<RetryFailedJobAtomicallyResult> {
    return this.indexes.manager.transaction(async (manager) => {
      const failedJob = await this.failedJobRepository.lockById(manager, input.failedJobId)

      if (!failedJob) return { status: 'not-found' }

      if (!(await this.knowledgeBaseRepository.belongsToProject(manager, failedJob.knowledgeBaseId, input.projectId))) {
        return { status: 'not-found' }
      }

      if (failedJob.retriedAt) return { status: 'already-retried' }

      if (
        failedJob.knowledgeBaseId !== input.expectedKnowledgeBaseId ||
        failedJob.documentId !== input.expectedDocumentId ||
        failedJob.documentIndexId !== input.expectedDocumentIndexId ||
        Number(failedJob.generation) !== input.expectedGeneration
      ) {
        return { status: 'stale' }
      }

      const membership = await this.membershipRepository.lockMembership(
        manager,
        failedJob.knowledgeBaseId,
        failedJob.documentId,
      )

      if (!membership) return { status: 'not-current' }

      const activeJob = await this.jobRepository.findActiveTarget(
        manager,
        failedJob.knowledgeBaseId,
        failedJob.documentId,
      )

      if (activeJob) return { status: 'active-job-exists' }

      const [latestRevision, documentIndex] = await Promise.all([
        this.documentRevisionRepository.findLatestForDocument(manager, failedJob.documentId),
        this.documentIndexRepository.findByIdIn(manager, failedJob.documentIndexId),
      ])

      if (
        Number(membership.requestedGeneration) !== input.expectedGeneration ||
        !latestRevision ||
        latestRevision.id !== input.expectedRevisionId ||
        !documentIndex ||
        documentIndex.revisionId !== latestRevision.id ||
        documentIndex.pipelineHash !== input.expectedPipelineHash
      ) {
        return { status: 'stale' }
      }

      const retryPayload = unpackRetryPayload(failedJob.retryPayload)
      const reusableProgress = { ...(retryPayload.executionState ?? {}) }
      delete reusableProgress.lastError
      const created = await this.jobRepository.createRetry(manager, {
        knowledgeBaseId: failedJob.knowledgeBaseId,
        documentId: failedJob.documentId,
        documentIndexId: failedJob.documentIndexId,
        generation: failedJob.generation,
        status: 'queued',
        attempts: 0,
        availableAt: input.now,
        reservedAt: null,
        leaseToken: null,
        idempotencyKey: input.idempotencyKey,
        retryOfFailedJobId: failedJob.id,
        payload: retryPayload.input,
        executionState: Object.keys(reusableProgress).length ? reusableProgress : null,
        executionVerification: null,
      })

      failedJob.retriedAt = input.now
      await this.failedJobRepository.save(manager, failedJob)

      return { status: 'retried', jobId: created.id }
    })
  }

  async withPruneTransaction<T>(work: (transaction: MembershipPruneTransaction) => Promise<T>): Promise<T> {
    return this.indexes.manager.transaction(async (manager) => {
      const transactionImpl: MembershipPruneTransaction = {
        findMembershipPruneRecords: async (
          projectId: string,
          knowledgeBaseId: string,
          documentIds: string[],
        ): Promise<MembershipPruneRecord[]> => {
          if (!(await this.knowledgeBaseRepository.belongsToProject(manager, knowledgeBaseId, projectId))) {
            return []
          }

          const retainedDocumentIds = new Set(documentIds)
          const allMemberships = await this.membershipRepository.lockForKnowledgeBase(manager, knowledgeBaseId)
          const candidates = allMemberships.filter((m) => !retainedDocumentIds.has(m.documentId))

          return Promise.all(
            candidates.map(async (candidate) => {
              const relatedJobs = await this.jobRepository.findForTarget(
                manager,
                knowledgeBaseId,
                candidate.documentId,
                true,
              )
              const jobs: MembershipPruneJob[] = relatedJobs.map((job) => ({
                id: job.id,
                status: job.status,
                leaseExpiresAt: job.reservedAt
                  ? new Date(job.reservedAt.getTime() + this.config.workerLeaseSeconds * 1000)
                  : null,
              }))

              return {
                membershipId: `${candidate.knowledgeBaseId}:${candidate.documentId}`,
                knowledgeBaseId: candidate.knowledgeBaseId,
                documentId: candidate.documentId,
                activeDocumentIndexId: candidate.activeDocumentIndexId,
                jobs,
              }
            }),
          )
        },
        clearActiveIndex: async (membershipId: string): Promise<boolean> => {
          const parts = membershipId.split(':')
          const knowledgeBaseId = parts[0]
          const documentId = parts[1]

          if (!knowledgeBaseId || !documentId) return false

          const membership = await this.membershipRepository.lockMembership(manager, knowledgeBaseId, documentId)

          if (!membership) return false

          const previousIndexId = membership.activeDocumentIndexId
          membership.activeDocumentIndexId = null
          await this.membershipRepository.saveRequestIn(manager, membership)

          if (previousIndexId) {
            await this.documentIndexRepository.markUnreferenced(manager, previousIndexId)
          }

          return true
        },
        removeMembership: async (membershipId: string): Promise<boolean> => {
          const parts = membershipId.split(':')
          const knowledgeBaseId = parts[0]
          const documentId = parts[1]

          if (!knowledgeBaseId || !documentId) return false

          const membership = await this.membershipRepository.lockMembership(manager, knowledgeBaseId, documentId)

          if (!membership) return false

          const relatedJobs = await this.jobRepository.findForTarget(manager, knowledgeBaseId, documentId, true)
          await this.jobRepository.removeMany(manager, relatedJobs)
          await this.membershipRepository.remove(manager, membership)

          return true
        },
        cancelJobsForDocument: async (knowledgeBaseId: string, documentId: string): Promise<void> => {
          const relatedJobs = await this.jobRepository.findForTarget(manager, knowledgeBaseId, documentId, true)
          await this.jobRepository.removeMany(manager, relatedJobs)
        },
      }

      return work(transactionImpl)
    })
  }

  async withGarbageCollectionTransaction<T>(
    work: (transaction: GarbageCollectionTransaction) => Promise<T>,
  ): Promise<T> {
    return this.indexes.manager.transaction(async (manager) => {
      const transactionImpl: GarbageCollectionTransaction = {
        deleteExpiredUnreferencedFailedJobs: (cutoff: Date): Promise<number> =>
          this.failedJobRepository.deleteExpiredUnreferenced(manager, cutoff),
        findGarbageIndexCandidates: async (): Promise<GarbageIndexCandidate[]> => {
          const indexRecords = await manager.getRepository(RagDocumentIndexModel).find({
            where: { status: 'ready', unreferencedSince: Not(IsNull()) },
          })

          return Promise.all(
            indexRecords.map(async (index) => {
              const membershipCount = await this.membershipRepository.countActiveReferences(manager, index.id)
              const jobCount = await this.jobRepository.countForIndex(manager, index.id)
              const failedJobCount = await this.failedJobRepository.countForIndex(manager, index.id)
              const runningJobs = await this.jobRepository.findForIndex(manager, index.id, true)
              const activeLeaseCount = runningJobs.filter((job) => this.jobRepository.hasActiveLease(job)).length

              return {
                documentIndexId: index.id,
                documentId: index.documentId,
                status: index.status,
                unreferencedSince: index.unreferencedSince,
                readyAt: index.readyAt,
                membershipCount,
                jobCount,
                failedJobCount,
                activeLeaseCount,
              }
            }),
          )
        },
        deleteIfUnreferenced: async (documentIndexId: string, cutoff: Date): Promise<boolean> => {
          const candidateIndex = await this.documentIndexRepository.lockGarbageCandidate(
            manager,
            documentIndexId,
            cutoff,
          )

          if (!candidateIndex) return false

          const activeMembership = await this.membershipRepository.findActiveReferenceIn(manager, candidateIndex.id)

          if (activeMembership) return false

          const relatedJobs = await this.jobRepository.findForIndex(manager, candidateIndex.id, true)

          if (relatedJobs.some((job) => this.jobRepository.hasActiveLease(job))) return false

          const relatedFailedJobs = await this.failedJobRepository.findByIndex(manager, candidateIndex.id)

          if (relatedFailedJobs.length > 0) return false

          await this.jobRepository.removeMany(manager, relatedJobs)
          await this.documentIndexRepository.removePlan(manager, candidateIndex.id)
          await this.documentIndexRepository.remove(manager, candidateIndex)

          return true
        },
      }

      return work(transactionImpl)
    })
  }
}
