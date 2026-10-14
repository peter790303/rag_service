import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, type EntityManager } from 'typeorm'

import { unpackRetryPayload } from './rag-retry-payload.js'
import { TypeOrmRagChunkRepository } from './typeorm-rag-chunk.repository.js'
import { TypeOrmRagDocumentIndexRepository } from './typeorm-rag-document-index.repository.js'
import { TypeOrmRagDocumentRelationRepository } from './typeorm-rag-document-relation.repository.js'
import { TypeOrmRagDocumentRevisionRepository } from './typeorm-rag-document-revision.repository.js'
import { TypeOrmRagDocumentRepository } from './typeorm-rag-document.repository.js'
import { TypeOrmRagFailedJobRepository } from './typeorm-rag-failed-job.repository.js'
import { TypeOrmRagJobClaimRepository } from './typeorm-rag-job-claim.repository.js'
import { TypeOrmRagJobRepository } from './typeorm-rag-job.repository.js'
import { TypeOrmRagKnowledgeBaseRepository } from './typeorm-rag-knowledge-base.repository.js'
import { TypeOrmRagMembershipRepository } from './typeorm-rag-membership.repository.js'
import type {
  RagIndexChunkReplacementStore,
  RagIndexChunkReplacementOperations,
} from '../../../Application/KnowledgeBases/Contracts/rag-index-chunk-replacement-store.js'
import {
  RagIndexCompletionTransactionRepository,
  type RagIndexCompletionTransaction,
} from '../../../Application/KnowledgeBases/Contracts/rag-index-completion-transaction.js'
import {
  RagIndexRequestTransactionRepository,
  type RagIndexRequestIndex,
  type RagIndexRequestTransaction,
} from '../../../Application/KnowledgeBases/Contracts/rag-index-request-transaction.js'
import {
  RagIndexProcessingRepository,
  type RagJobProgressContract,
  type RagJobFailureStore,
  type RagJobFailureTransaction,
} from '../../../Application/KnowledgeBases/Contracts/rag-indexing-repository.js'
import type {
  ClaimedRagIndexJobContract,
  RagJobClaimTransaction,
  RagJobClaimTransactionBoundary,
} from '../../../Application/KnowledgeBases/Contracts/rag-job-claim-transaction.js'
import {
  RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS,
  RagFailedJobRetryStore,
  RagJobStatusReader,
  type RetryContext,
  type RetryFailedJobAtomicallyInput,
  type RetryFailedJobAtomicallyResult,
  type RagJobStatusFacts,
} from '../../../Application/KnowledgeBases/Contracts/rag-job-management.js'
import {
  GarbageCollectionTransaction,
  MembershipPruneTransaction,
  type GarbageIndexCandidate,
  type GarbageDocumentCandidate,
  type GarbageRevisionCandidate,
  type MembershipPruneRecord,
} from '../../../Application/KnowledgeBases/Contracts/rag-retention-operations.js'
import {
  RagGarbageCollectionStore,
  RagMembershipPruningStore,
} from '../../../Application/KnowledgeBases/Contracts/rag-retention-store.js'
import {
  RagRetrievalStore,
  type HybridSnapshotResult,
  type HybridSnapshotSelection,
  type RagRetrievalContextCriteria,
  type RagRetrievalCriteria,
  type RagRetrievalLimits,
  type RetrievalSnapshot,
} from '../../../Application/KnowledgeBases/Contracts/rag-retrieval-store.js'
import { InvalidRagJobLeaseException } from '../../../Domain/Knowledge/Exceptions/invalid-rag-job-lease.exception.js'
import { KnowledgeJobNotFoundException } from '../../../Domain/Knowledge/Exceptions/knowledge-job-not-found.exception.js'
import { RAG_JOB_STATUS } from '../../../Domain/Knowledge/rag-job.js'
import { TypeOrmRagRetrievalSnapshotAdapter } from '../Adapters/typeorm-rag-retrieval-snapshot.adapter.js'
import { RagDocumentIndexFactory } from '../Factories/rag-document-index.factory.js'
import { RagJobFactory } from '../Factories/rag-job.factory.js'
import { RagDocumentIndexModel } from '../Models/rag-document-index.model.js'
import { RagDocumentModel } from '../Models/rag-document.model.js'
import { RagFailedJobModel } from '../Models/rag-failed-job.model.js'
import { RagJobModel } from '../Models/rag-job.model.js'
import { RagMembershipModel } from '../Models/rag-membership.model.js'
import { TypeOrmRagJobClaimTransaction } from '../typeorm-rag-job-claim-transaction.js'

@Injectable()
export class TypeOrmRagRepository
  implements
    RagIndexRequestTransactionRepository,
    RagIndexCompletionTransactionRepository,
    RagIndexChunkReplacementStore,
    RagJobClaimTransactionBoundary,
    RagIndexProcessingRepository,
    RagJobFailureStore,
    RagRetrievalStore,
    RagJobStatusReader,
    RagFailedJobRetryStore,
    RagMembershipPruningStore,
    RagGarbageCollectionStore
{
  constructor(
    @InjectRepository(RagDocumentIndexModel) private readonly indexes: Repository<RagDocumentIndexModel>,
    private readonly jobRepository: TypeOrmRagJobRepository,
    private readonly membershipRepository: TypeOrmRagMembershipRepository,
    private readonly documentIndexRepository: TypeOrmRagDocumentIndexRepository,
    private readonly knowledgeBaseRepository: TypeOrmRagKnowledgeBaseRepository,
    private readonly documentRepository: TypeOrmRagDocumentRepository,
    private readonly documentRevisionRepository: TypeOrmRagDocumentRevisionRepository,
    private readonly failedJobRepository: TypeOrmRagFailedJobRepository,
    private readonly chunks: TypeOrmRagChunkRepository,
    private readonly relations: TypeOrmRagDocumentRelationRepository,
    private readonly claimRepository: TypeOrmRagJobClaimRepository,
  ) {}

  async withClaimTransaction<T>(work: (transaction: RagJobClaimTransaction) => Promise<T>): Promise<T> {
    return this.claimRepository.manager.transaction((manager) =>
      work(
        new TypeOrmRagJobClaimTransaction(
          manager,
          this.claimRepository,
          this.documentRepository,
          this.membershipRepository,
          this.documentIndexRepository,
          this.failedJobRepository,
        ),
      ),
    )
  }

  async withTransaction<T>(operation: (transaction: RagIndexRequestTransaction) => Promise<T>): Promise<T> {
    return this.indexes.manager.transaction((manager) =>
      operation({
        lockKnowledgeBase: (knowledgeBaseId) => this.knowledgeBaseRepository.lockByIdIn(manager, knowledgeBaseId),
        createKnowledgeBase: async (knowledgeBase) => {
          await this.knowledgeBaseRepository.createIn(manager, knowledgeBase)
        },
        saveKnowledgeBase: async (knowledgeBase) => {
          await this.knowledgeBaseRepository.saveIn(manager, knowledgeBase)
        },
        ensureSource: async ({ sourceType, sourceKey, sourcePath, currentTitle }) => {
          const document = await this.documentRepository.ensureSourceIn(
            manager,
            sourceType,
            sourceKey,
            sourcePath,
            currentTitle,
          )

          return { documentId: document.id }
        },
        lockDocument: async (documentId) => (await this.documentRepository.lockById(manager, documentId)) !== null,
        createMembershipIfMissing: async ({ knowledgeBaseId, documentId, initialState }) => {
          await manager
            .createQueryBuilder()
            .insert()
            .into(RagMembershipModel)
            .values({
              knowledgeBaseId,
              documentId,
              ...initialState,
              requestedGeneration: String(initialState.requestedGeneration),
            })
            .orIgnore()
            .execute()
        },
        lockMembership: async (knowledgeBaseId, documentId) => {
          const membership = await this.membershipRepository.lockMembership(manager, knowledgeBaseId, documentId)

          return membership
            ? {
                knowledgeBaseId: membership.knowledgeBaseId,
                documentId: membership.documentId,
                requestedGeneration: Number(membership.requestedGeneration),
                activeDocumentIndexId: membership.activeDocumentIndexId,
              }
            : null
        },
        updateMembershipOptions: async ({ knowledgeBaseId, documentId, isEntry, alwaysIncludeFullContent }) => {
          const update = {
            ...(isEntry === undefined ? {} : { isEntry }),
            ...(alwaysIncludeFullContent === undefined ? {} : { alwaysIncludeFullContent }),
          }

          if (Object.keys(update).length)
            await manager.getRepository(RagMembershipModel).update({ knowledgeBaseId, documentId }, update)
        },
        findOrCreateRevision: async ({ documentId, contentSha256, title, content }) => {
          const revision = await this.documentRevisionRepository.findOrCreate(
            manager,
            documentId,
            contentSha256,
            title,
            content,
          )

          return { revisionId: revision.id }
        },
        findOrCreateIndex: async ({ documentId, revisionId, initialState, ...pipeline }) => {
          let index = await this.documentIndexRepository.findByRevisionAndPipeline(
            manager,
            revisionId,
            pipeline.pipelineHash,
          )

          if (!index)
            index = await this.documentIndexRepository.createBuildingIndex(manager, {
              documentId,
              revisionId,
              ...pipeline,
              ...initialState,
            })

          return this.toRequestIndex(index)
        },
        lockCurrentJob: async (knowledgeBaseId, documentId) => {
          const job = await this.jobRepository.lockCurrentTarget(manager, knowledgeBaseId, documentId)

          return job
            ? {
                id: job.id,
                documentIndexId: job.documentIndexId,
                generation: Number(job.generation),
                status: job.status,
              }
            : null
        },
        hasUnretriedFailure: async ({ knowledgeBaseId, documentId, documentIndexId, generation }) =>
          (await this.failedJobRepository.findCurrentUnretried(
            manager,
            knowledgeBaseId,
            documentId,
            documentIndexId,
            String(generation),
          )) !== null,
        lockIndexesById: async (documentIndexIds) =>
          (await this.documentIndexRepository.lockManyById(manager, documentIndexIds)).map((index) =>
            this.toRequestIndex(index),
          ),
        updateMembershipRequest: async ({
          knowledgeBaseId,
          documentId,
          requestedGeneration,
          activeDocumentIndexId,
        }) => {
          await manager
            .getRepository(RagMembershipModel)
            .update(
              { knowledgeBaseId, documentId },
              { requestedGeneration: String(requestedGeneration), activeDocumentIndexId },
            )
        },
        removeCurrentJob: async (jobId) => {
          await manager.getRepository(RagJobModel).delete(jobId)
        },
        enqueueJob: async ({
          knowledgeBaseId,
          documentId,
          documentIndexId,
          generation,
          status,
          attempts,
          availableAt,
          payload,
        }) => {
          const job = await this.jobRepository.saveQueuedTarget(manager, {
            knowledgeBaseId,
            documentId,
            documentIndexId,
            generation: String(generation),
            status,
            attempts,
            availableAt,
            idempotencyKey: null,
            retryOfFailedJobId: null,
            payload,
            executionState: null,
            executionVerification: null,
          })

          return { jobId: job.id }
        },
        updateIndexUnreferencedSince: (documentIndexId, value) =>
          this.documentIndexRepository.setUnreferencedSince(manager, documentIndexId, value),
      }),
    )
  }

  private toRequestIndex(index: RagDocumentIndexModel): RagIndexRequestIndex {
    return {
      id: index.id,
      documentId: index.documentId,
      revisionId: index.revisionId,
      status: index.status,
    }
  }

  async heartbeat(
    job: ClaimedRagIndexJobContract,
    progress: RagJobProgressContract,
    now: Date,
    leaseExpiresAt: Date,
  ): Promise<void> {
    await this.indexes.manager.transaction(async (manager) => {
      const document = await this.documentRepository.lockById(manager, job.documentId)
      const membership = await this.membershipRepository.lockMembership(manager, job.knowledgeBaseId, job.documentId)

      if (!document || membership?.requestedGeneration !== job.generation) throw new InvalidRagJobLeaseException()

      await this.jobRepository.heartbeat(manager, job, progress, now, leaseExpiresAt)
    })
  }

  async loadSnapshot(input: RagRetrievalCriteria, limits: RagRetrievalLimits): Promise<RetrievalSnapshot> {
    void limits

    return this.indexes.manager.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY')
      const reader = this.retrievalSnapshotIn(manager)
      const snapshot = await reader.loadFacts(input.projectId)
      const chunks = await reader.findChunks(snapshot.indexes.map((index) => index.id))

      return { ...snapshot, chunks }
    })
  }

  async loadHybridSnapshot<TSelection>(
    input: RagRetrievalCriteria,
    select: (snapshot: RetrievalSnapshot) => HybridSnapshotSelection<TSelection>,
    selectCandidates: (
      chunks: import('../../../Application/KnowledgeBases/Contracts/rag-chunk-repository.port.js').RagChunkRepositoryPort,
      selection: TSelection,
    ) => Promise<import('./Contracts/rag-retrieval-store.js').HybridCandidate[]>,
    selectContextCriteria: (
      candidates: import('./Contracts/rag-retrieval-store.js').HybridCandidate[],
      selection: TSelection,
    ) => RagRetrievalContextCriteria,
  ): Promise<HybridSnapshotResult<TSelection>> {
    return this.indexes.manager.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY')
      const reader = this.retrievalSnapshotIn(manager)
      const facts = await reader.loadFacts(input.projectId)
      const selection = select(facts)
      const chunks = await reader.findChunks(selection.requiredIndexIds)
      const candidates = await selectCandidates(reader, selection.value)
      const contextCriteria = selectContextCriteria(candidates, selection.value)
      const contextChunks = await reader.findContext(contextCriteria, selection.retrievalIndexIds)
      const relationTargetChunks = await reader.findChunks(selection.relationTargetIndexIds)

      return {
        snapshot: { ...facts, chunks },
        candidates,
        contextChunks,
        relationTargetChunks,
        selection: selection.value,
      }
    })
  }

  private retrievalSnapshotIn(manager: EntityManager): TypeOrmRagRetrievalSnapshotAdapter {
    return new TypeOrmRagRetrievalSnapshotAdapter(
      manager,
      this.knowledgeBaseRepository,
      this.membershipRepository,
      this.documentRepository,
      this.documentIndexRepository,
      this.documentRevisionRepository,
      this.chunks,
      this.relations,
    )
  }

  async loadContent(documentIndexId: string): Promise<string> {
    return this.documentIndexRepository.loadContent(documentIndexId)
  }

  async jobStatus(projectId: string, id: string): Promise<RagJobStatusFacts> {
    const activeJob = await this.jobRepository.findByIdInProject(projectId, id)
    const failedJob = activeJob ? null : await this.failedJobRepository.findByIdOrJobIdInProject(id, projectId)
    const knowledgeBaseId = activeJob?.knowledgeBaseId ?? failedJob?.knowledgeBaseId
    const documentId = activeJob?.documentId ?? failedJob?.documentId
    const targetIndexId = activeJob?.documentIndexId ?? failedJob?.documentIndexId
    const targetGeneration = activeJob?.generation ?? failedJob?.generation

    if (!knowledgeBaseId || !documentId || !targetIndexId || !targetGeneration)
      throw new KnowledgeJobNotFoundException(id)

    const membership = await this.membershipRepository.findForSource(knowledgeBaseId, documentId)
    const activeIndex = membership?.activeDocumentIndexId
      ? await this.documentIndexRepository.findById(membership.activeDocumentIndexId)
      : null
    const targetIndex = await this.documentIndexRepository.findById(targetIndexId)

    return {
      activeIndex: activeIndex
        ? { id: activeIndex.id, status: activeIndex.status, readyAt: activeIndex.readyAt }
        : null,
      requestedTarget: {
        indexId: targetIndexId,
        generation: targetGeneration,
        targetStateFacts: {
          requestedGeneration: membership?.requestedGeneration ?? null,
          targetGeneration,
          activeJobStatus: activeJob?.status ?? null,
          hasFailedJob: failedJob !== null,
          targetIndexStatus: targetIndex?.status ?? null,
        },
        jobId: activeJob?.id ?? null,
        failedJobId: failedJob?.id ?? null,
        attempts: activeJob?.attempts ?? failedJob?.attempts ?? null,
        errorCode: failedJob?.errorCode ?? null,
        errorMessage: failedJob?.errorMessage ?? null,
        executionVerification: RagJobFactory.toExecutionVerification(activeJob?.executionVerification ?? null),
      },
    }
  }

  async withReplacementTransaction<T>(
    operation: (transaction: RagIndexChunkReplacementOperations) => Promise<T>,
  ): Promise<T> {
    return this.indexes.manager.transaction((manager) =>
      operation({
        lockDocument: async (documentId) => (await this.documentRepository.lockById(manager, documentId)) !== null,
        lockMembership: async (knowledgeBaseId, documentId) => {
          const membership = await this.membershipRepository.lockMembership(manager, knowledgeBaseId, documentId)

          return membership ? { requestedGeneration: Number(membership.requestedGeneration) } : null
        },
        lockClaimedJob: async (job, now) => {
          const jobRecord = await this.jobRepository.lockById(manager, job.id)
          this.jobRepository.assertLeaseOwnership(jobRecord, job, now)
        },
        lockDocumentIndex: async (documentIndexId) => {
          const index = await this.documentIndexRepository.lockById(manager, documentIndexId)

          return index ? RagDocumentIndexFactory.toDomain(index) : null
        },
        deleteChunksForIndex: (documentIndexId) => this.chunks.removeForIndex(manager, documentIndexId),
        saveChunks: (rows) => this.chunks.saveRowsIn(manager, rows),
        deleteRelationsForIndex: (documentIndexId) => this.relations.removeForIndex(manager, documentIndexId),
        saveRelations: (documentIndexId, relations) =>
          this.relations.savePlannedIn(manager, documentIndexId, relations),
      }),
    )
  }

  async withCompletionTransaction<T>(
    operation: (transaction: RagIndexCompletionTransaction) => Promise<T>,
  ): Promise<T> {
    return this.indexes.manager.transaction((manager) => {
      let membershipRecord: RagMembershipModel | null = null
      let claimedJobRecord: RagJobModel | null = null

      return operation({
        lockDocument: async (documentId) => (await this.documentRepository.lockById(manager, documentId)) !== null,
        lockMembership: async (knowledgeBaseId, documentId) => {
          membershipRecord = await this.membershipRepository.lockMembership(manager, knowledgeBaseId, documentId)

          return membershipRecord
            ? {
                requestedGeneration: Number(membershipRecord.requestedGeneration),
                activeDocumentIndexId: membershipRecord.activeDocumentIndexId,
              }
            : null
        },
        lockClaimedJob: async (job: ClaimedRagIndexJobContract, now) => {
          claimedJobRecord = await this.jobRepository.lockById(manager, job.id)
          this.jobRepository.assertLeaseOwnership(claimedJobRecord, job, now)
        },
        lockIndexesById: async (documentIndexIds) =>
          (await this.documentIndexRepository.lockManyById(manager, documentIndexIds)).map((index) => index.id),
        markIndexReady: async (documentIndexId, readyAt) => {
          await this.documentIndexRepository.markReady(manager, documentIndexId, readyAt)
        },
        activateMembership: async (knowledgeBaseId, documentId, documentIndexId) => {
          if (
            !membershipRecord ||
            membershipRecord.knowledgeBaseId !== knowledgeBaseId ||
            membershipRecord.documentId !== documentId
          ) {
            throw new Error('Membership must be locked before it can be activated')
          }

          membershipRecord.activeDocumentIndexId = documentIndexId
          await this.membershipRepository.saveRequestIn(manager, membershipRecord)
        },
        markIndexUnreferenced: (documentIndexId, unreferencedSince) =>
          this.documentIndexRepository.markUnreferenced(manager, documentIndexId, unreferencedSince),
        removeClaimedJob: async (job) => {
          if (!claimedJobRecord || claimedJobRecord.id !== job.id) {
            throw new Error('Claimed job must be locked before it can be removed')
          }

          await this.jobRepository.removeClaimed(manager, claimedJobRecord)
        },
      })
    })
  }

  async withFailureTransaction<T>(operation: (transaction: RagJobFailureTransaction) => Promise<T>): Promise<T> {
    return this.indexes.manager.transaction((manager) => {
      let claimedRecord: RagJobModel | null = null

      return operation({
        lockDocument: async (documentId) => (await this.documentRepository.lockById(manager, documentId)) !== null,
        lockMembership: async (knowledgeBaseId, documentId) => {
          const membership = await this.membershipRepository.lockMembership(manager, knowledgeBaseId, documentId)

          return membership ? { requestedGeneration: Number(membership.requestedGeneration) } : null
        },
        lockClaimedJob: async (job, now) => {
          claimedRecord = await this.jobRepository.lockById(manager, job.id)
          this.jobRepository.assertLeaseOwnership(claimedRecord, job, now)

          return RagJobFactory.toExpiredLeaseFact(
            claimedRecord,
            RagJobFactory.toRunningDomain(claimedRecord).leaseExpiresAt,
          )
        },
        lockIndex: async (documentIndexId) =>
          (await this.documentIndexRepository.lockManyById(manager, [documentIndexId])).length === 1,
        queueRetry: async (jobId, availableAt, executionState) => {
          if (!claimedRecord || claimedRecord.id !== jobId) throw new InvalidRagJobLeaseException()

          claimedRecord.status = RAG_JOB_STATUS.QUEUED
          claimedRecord.availableAt = availableAt
          claimedRecord.reservedAt = null
          claimedRecord.leaseToken = null
          claimedRecord.executionVerification = null
          claimedRecord.executionState = executionState
          await this.jobRepository.save(manager, claimedRecord)
        },
        archiveFailedJob: async (archive) => {
          await this.failedJobRepository.createAndSave(manager, archive)
        },
        markIndexUnreferenced: (documentIndexId, at) =>
          this.documentIndexRepository.markUnreferenced(manager, documentIndexId, at),
        removeClaimedJob: async (jobId) => {
          if (!claimedRecord || claimedRecord.id !== jobId) throw new InvalidRagJobLeaseException()

          await this.jobRepository.removeClaimed(manager, claimedRecord)
        },
      })
    })
  }

  async readRetryContext(failedJobId: string): Promise<RetryContext | null> {
    return this.indexes.manager.transaction(async (manager) => {
      const failedJob = await this.failedJobRepository.findByIdIn(manager, failedJobId)

      if (!failedJob) return null

      return this.loadRetryContext(manager, failedJob)
    })
  }

  private async loadRetryContext(
    manager: EntityManager,
    failedJob: RagFailedJobModel,
    lockedTarget?: { document: RagDocumentModel | null; membership: RagMembershipModel | null },
  ): Promise<RetryContext | null> {
    const knowledgeBase = await this.knowledgeBaseRepository.findByIdIn(manager, failedJob.knowledgeBaseId)

    if (!knowledgeBase) return null

    const document = lockedTarget
      ? lockedTarget.document
      : await this.documentRepository.findByIdIn(manager, failedJob.documentId)
    const membership = lockedTarget
      ? lockedTarget.membership
      : await this.membershipRepository.findForSourceIn(manager, failedJob.knowledgeBaseId, failedJob.documentId)
    const documentIndex = await this.documentIndexRepository.findByIdIn(manager, failedJob.documentIndexId)
    const activeJob = await this.jobRepository.findActiveTarget(
      manager,
      failedJob.knowledgeBaseId,
      failedJob.documentId,
    )
    const targetRevision = documentIndex
      ? await this.documentRevisionRepository.findByIdForDocument(
          manager,
          failedJob.documentId,
          documentIndex.revisionId,
        )
      : null

    return {
      failedJob: {
        id: failedJob.id,
        knowledgeBaseId: failedJob.knowledgeBaseId,
        documentId: failedJob.documentId,
        documentIndexId: failedJob.documentIndexId,
        generation: Number(failedJob.generation),
        attempts: failedJob.attempts,
        retryOfFailedJobId: null,
        retriedAt: failedJob.retriedAt,
        retryPayload: unpackRetryPayload(failedJob.retryPayload),
      },
      knowledgeBase: { id: knowledgeBase.id, projectId: knowledgeBase.projectId },
      document: document
        ? {
            id: document.id,
            sourceType: document.sourceType,
            sourceKey: document.sourceKey,
            sourcePath: document.sourcePath,
            currentTitle: document.currentTitle,
            targetRevision: targetRevision
              ? {
                  id: targetRevision.id,
                  contentSha256: targetRevision.contentSha256,
                  content: targetRevision.content,
                }
              : null,
          }
        : null,
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
      activeJob: activeJob ? { id: activeJob.id, status: activeJob.status } : null,
    }
  }

  async retryFailedJobAtomically(input: RetryFailedJobAtomicallyInput): Promise<RetryFailedJobAtomicallyResult> {
    return this.indexes.manager.transaction(async (manager) => {
      // Discover immutable target identifiers first, then acquire parent and child locks
      // in the shared document -> membership -> job order.
      const candidate = await this.failedJobRepository.findByIdIn(manager, input.failedJobId)
      const candidateBelongsToProject = candidate
        ? await this.knowledgeBaseRepository.belongsToProject(manager, candidate.knowledgeBaseId, input.projectId)
        : false
      const lockedDocument =
        candidate && candidateBelongsToProject
          ? await this.documentRepository.lockById(manager, candidate.documentId)
          : null
      const lockedMembership =
        candidate && candidateBelongsToProject && lockedDocument
          ? await this.membershipRepository.lockMembership(manager, candidate.knowledgeBaseId, candidate.documentId)
          : null
      const failedJob = await this.failedJobRepository.lockById(manager, input.failedJobId)
      const belongsToProject = failedJob
        ? await this.knowledgeBaseRepository.belongsToProject(manager, failedJob.knowledgeBaseId, input.projectId)
        : false
      const membership =
        failedJob &&
        belongsToProject &&
        lockedDocument !== null &&
        candidate?.knowledgeBaseId === failedJob.knowledgeBaseId &&
        candidate.documentId === failedJob.documentId
          ? lockedMembership
          : null
      const context =
        !failedJob || !belongsToProject
          ? null
          : await this.loadRetryContext(manager, failedJob, {
              document: lockedDocument,
              membership,
            })

      if (!context || !failedJob) return { status: RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.NOT_FOUND }

      const { expected } = input

      if (
        context.failedJob.knowledgeBaseId !== expected.knowledgeBaseId ||
        context.failedJob.documentId !== expected.documentId ||
        context.failedJob.documentIndexId !== expected.documentIndexId ||
        context.failedJob.generation !== expected.generation ||
        context.failedJob.attempts !== expected.attempts ||
        context.failedJob.retriedAt !== expected.retriedAt ||
        context.document?.id !== expected.documentId ||
        context.document.sourceType !== expected.sourceType ||
        context.document.targetRevision?.id !== expected.revisionId ||
        context.documentIndex?.id !== expected.documentIndexId ||
        context.documentIndex.documentRevisionId !== expected.revisionId ||
        context.documentIndex.pipelineHash !== expected.pipelineHash ||
        context.membership?.requestedGeneration !== expected.membership.requestedGeneration ||
        context.membership.activeDocumentIndexId !== expected.membership.activeDocumentIndexId ||
        context.activeJob !== expected.activeJobId
      ) {
        return { status: RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.STALE }
      }

      const created = await this.jobRepository.createRetry(manager, {
        knowledgeBaseId: failedJob.knowledgeBaseId,
        documentId: failedJob.documentId,
        documentIndexId: failedJob.documentIndexId,
        generation: failedJob.generation,
        status: input.retry.status,
        attempts: input.retry.attempts,
        availableAt: input.now,
        reservedAt: null,
        leaseToken: null,
        idempotencyKey: input.idempotencyKey,
        retryOfFailedJobId: failedJob.id,
        payload: input.retry.payload,
        executionState: input.retry.executionState,
        executionVerification: null,
      })

      await this.failedJobRepository.markRetried(manager, failedJob.id, input.now)

      return { status: RAG_FAILED_JOB_RETRY_TRANSACTION_STATUS.RETRIED, jobId: created.id }
    })
  }

  async withPruneTransaction<T>(work: (transaction: MembershipPruneTransaction) => Promise<T>): Promise<T> {
    return this.indexes.manager.transaction(async (manager) => {
      const transactionImpl: MembershipPruneTransaction = {
        isKnowledgeBaseInProject: (projectId, knowledgeBaseId) =>
          this.knowledgeBaseRepository.belongsToProject(manager, knowledgeBaseId, projectId),
        findMembershipPruneRecords: async (knowledgeBaseId): Promise<MembershipPruneRecord[]> => {
          const memberships = await this.membershipRepository.findForKnowledgeBase(manager, knowledgeBaseId)

          return memberships.map(({ knowledgeBaseId, documentId }) => ({ knowledgeBaseId, documentId }))
        },
        lockDocumentForPrune: async (documentId) =>
          Boolean(await this.documentRepository.lockById(manager, documentId)),
        lockMembershipForPrune: async (knowledgeBaseId, documentId) => {
          const membership = await this.membershipRepository.lockMembership(manager, knowledgeBaseId, documentId)

          return membership ? { activeDocumentIndexId: membership.activeDocumentIndexId } : null
        },
        clearActiveIndex: async (knowledgeBaseId, documentId) => {
          const membership = await this.membershipRepository.lockMembership(manager, knowledgeBaseId, documentId)

          if (!membership) return false

          membership.activeDocumentIndexId = null
          await this.membershipRepository.saveRequestIn(manager, membership)

          return true
        },
        markIndexUnreferenced: (documentIndexId, unreferencedSince) =>
          this.documentIndexRepository.markUnreferenced(manager, documentIndexId, unreferencedSince),
        removeMembership: async (knowledgeBaseId, documentId) => {
          const membership = await this.membershipRepository.lockMembership(manager, knowledgeBaseId, documentId)

          if (!membership) return false

          await this.membershipRepository.remove(manager, membership)

          return true
        },
        cancelJobsForDocument: async (knowledgeBaseId, documentId) => {
          const jobs = await this.jobRepository.findForTarget(manager, knowledgeBaseId, documentId, true)
          await this.jobRepository.removeMany(manager, jobs)

          return jobs.map((job) => job.documentIndexId)
        },
        lockIndexForPrune: async (documentIndexId) =>
          Boolean(await this.documentIndexRepository.lockById(manager, documentIndexId)),
        countMembershipsForIndex: (documentIndexId) =>
          this.membershipRepository.countActiveReferences(manager, documentIndexId),
        countJobsForIndex: (documentIndexId) => this.jobRepository.countForIndex(manager, documentIndexId),
        countMembershipsForDocument: (documentId) => this.membershipRepository.countForDocumentIn(manager, documentId),
        countRevisionsForDocument: (documentId) =>
          this.documentRevisionRepository.countForDocumentIn(manager, documentId),
        countIndexesForDocument: (documentId) => this.documentIndexRepository.countForDocumentIn(manager, documentId),
        countJobsForDocument: (documentId) => this.jobRepository.countForDocumentIn(manager, documentId),
        countFailedJobsForDocument: (documentId) => this.failedJobRepository.countForDocumentIn(manager, documentId),
        countRelationsTargetingDocument: (documentId) =>
          this.relations.countTargetDocumentReferencesIn(manager, documentId),
        markDocumentUnreferenced: (documentId, unreferencedSince) =>
          this.documentRepository.markUnreferencedIn(manager, documentId, unreferencedSince),
      }

      return work(transactionImpl)
    })
  }

  async withGarbageCollectionTransaction<T>(
    work: (transaction: GarbageCollectionTransaction) => Promise<T>,
  ): Promise<T> {
    return this.indexes.manager.transaction(async (manager) => {
      const transactionImpl: GarbageCollectionTransaction = {
        findGarbageFailedJobCandidates: (cutoff) => this.failedJobRepository.findGarbageCandidates(manager, cutoff),
        lockFailedJobForRetention: (failedJobId) =>
          this.failedJobRepository.lockForGarbageCollection(manager, failedJobId),
        countRetriesForFailedJob: (failedJobId) => this.jobRepository.countRetriesForFailedJob(manager, failedJobId),
        removeFailedJob: (failedJobId) => this.failedJobRepository.removeForGarbageCollection(manager, failedJobId),
        findGarbageIndexCandidates: async (cutoff): Promise<GarbageIndexCandidate[]> => {
          const indexes = await this.documentIndexRepository.findGarbageCandidatesIn(manager, cutoff)

          return indexes.map((index) => ({
            documentIndexId: index.id,
            documentId: index.documentId,
            status: index.status,
            unreferencedSince: index.unreferencedSince,
            readyAt: index.readyAt,
          }))
        },
        findIndexRelationTargets: async (documentIndexIds) => {
          const relations = await this.relations.findForSourceIndexIdsIn(manager, documentIndexIds)

          return relations.flatMap((relation) =>
            relation.targetDocumentId
              ? [
                  {
                    documentIndexId: relation.sourceIndexId,
                    documentId: relation.targetDocumentId,
                  },
                ]
              : [],
          )
        },
        lockGarbageIndex: async (documentIndexId): Promise<GarbageIndexCandidate | null> => {
          const index = await this.documentIndexRepository.lockById(manager, documentIndexId)

          return index
            ? {
                documentIndexId: index.id,
                documentId: index.documentId,
                status: index.status,
                unreferencedSince: index.unreferencedSince,
                readyAt: index.readyAt,
              }
            : null
        },
        countMembershipsForIndex: (documentIndexId) =>
          this.membershipRepository.countActiveReferences(manager, documentIndexId),
        countJobsForIndex: (documentIndexId) => this.jobRepository.countForIndex(manager, documentIndexId),
        countFailedJobsForIndex: (documentIndexId) => this.failedJobRepository.countForIndex(manager, documentIndexId),
        removeRelationsForIndex: (documentIndexId) => this.relations.removeForIndex(manager, documentIndexId),
        removeChunksForIndex: (documentIndexId) => this.chunks.removeForIndex(manager, documentIndexId),
        removeGarbageIndex: (documentIndexId) => this.documentIndexRepository.deleteByIdIn(manager, documentIndexId),
        findGarbageRevisionCandidates: async (cutoff): Promise<GarbageRevisionCandidate[]> => {
          const revisions = await this.documentRevisionRepository.findGarbageCandidatesIn(manager, cutoff)

          return revisions.map((revision) => ({
            documentRevisionId: revision.id,
            documentId: revision.documentId,
            createdAt: revision.createdAt,
          }))
        },
        lockGarbageRevision: async (documentRevisionId): Promise<GarbageRevisionCandidate | null> => {
          const revision = await this.documentRevisionRepository.lockByIdIn(manager, documentRevisionId)

          return revision
            ? {
                documentRevisionId: revision.id,
                documentId: revision.documentId,
                createdAt: revision.createdAt,
              }
            : null
        },
        countIndexesForRevision: (documentRevisionId) =>
          this.documentIndexRepository.countForRevisionIn(manager, documentRevisionId),
        removeGarbageRevision: (documentRevisionId) =>
          this.documentRevisionRepository.deleteByIdIn(manager, documentRevisionId),
        findGarbageDocumentCandidates: async (cutoff): Promise<GarbageDocumentCandidate[]> => {
          const documents = await this.documentRepository.findGarbageCandidatesIn(manager, cutoff)

          return documents.map((document) => ({
            documentId: document.id,
            unreferencedSince: document.unreferencedSince,
          }))
        },
        lockGarbageDocument: async (documentId): Promise<GarbageDocumentCandidate | null> => {
          const document = await this.documentRepository.lockById(manager, documentId)

          return document ? { documentId: document.id, unreferencedSince: document.unreferencedSince } : null
        },
        countMembershipsForDocument: (documentId) => this.membershipRepository.countForDocumentIn(manager, documentId),
        countRevisionsForDocument: (documentId) =>
          this.documentRevisionRepository.countForDocumentIn(manager, documentId),
        countIndexesForDocument: (documentId) => this.documentIndexRepository.countForDocumentIn(manager, documentId),
        countJobsForDocument: (documentId) => this.jobRepository.countForDocumentIn(manager, documentId),
        countFailedJobsForDocument: (documentId) => this.failedJobRepository.countForDocumentIn(manager, documentId),
        countRelationsTargetingDocument: (documentId) =>
          this.relations.countTargetDocumentReferencesIn(manager, documentId),
        markDocumentUnreferenced: (documentId, unreferencedSince) =>
          this.documentRepository.markUnreferencedIn(manager, documentId, unreferencedSince),
        removeGarbageDocument: (documentId) => this.documentRepository.deleteByIdIn(manager, documentId),
      }

      return work(transactionImpl)
    })
  }
}
