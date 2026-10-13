import { randomUUID } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MoreThan, Not, Repository } from 'typeorm'
import type { EntityManager } from 'typeorm'

import type { ClaimedRagIndexJob, RagJobProgress } from './Contracts/rag-indexing-store.js'
import { TypeOrmRagFailedJobRepository } from './typeorm-rag-failed-job.repository.js'
import type { RagConfig } from '../../../../config/rag.config.js'
import { RAG_CONFIG } from '../../../../config/rag.config.js'
import type {
  RagExecutionVerification,
  RagJobStatusDto,
} from '../../../Application/KnowledgeBases/DataTransferObjects/rag.dto.js'
import { RagExecutionStageEnum } from '../../../Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { RagJobTargetStateEnum } from '../../../Domain/Knowledge/Enums/rag-job-target-state.enum.js'
import { InvalidRagJobLeaseException } from '../../../Domain/Knowledge/Exceptions/invalid-rag-job-lease.exception.js'
import { KnowledgeJobNotFoundException } from '../../../Domain/Knowledge/Exceptions/knowledge-job-not-found.exception.js'
import { RagDocumentIndexModel } from '../Models/rag-document-index.model.js'
import { RagJobModel } from '../Models/rag-job.model.js'
import { RagKnowledgeBaseModel } from '../Models/rag-knowledge-base.model.js'
import { RagMembershipModel } from '../Models/rag-membership.model.js'

type RetryableRagJobAttributes = {
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
  generation: string
  status: string
  attempts: number
  availableAt: Date
  reservedAt: Date | null
  leaseToken: string | null
  idempotencyKey: string | null
  retryOfFailedJobId: string | null
  payload: Record<string, unknown>
  executionState: Record<string, unknown> | null
  executionVerification: Record<string, unknown> | null
}

type QueuedRagJobAttributes = {
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
  generation: string
  idempotencyKey: string | null
  retryOfFailedJobId: string | null
  payload: Record<string, unknown>
  executionState: Record<string, unknown> | null
  executionVerification: Record<string, unknown> | null
}

/** Job-primary persistence operations, including atomic worker claiming. */
@Injectable()
export class TypeOrmRagJobRepository {
  constructor(
    @InjectRepository(RagJobModel) private readonly jobs: Repository<RagJobModel>,
    @InjectRepository(RagMembershipModel) private readonly memberships: Repository<RagMembershipModel>,
    @InjectRepository(RagDocumentIndexModel) private readonly indexes: Repository<RagDocumentIndexModel>,
    @Inject(RAG_CONFIG) private readonly config: RagConfig,
    private readonly failedJobRepository: TypeOrmRagFailedJobRepository,
  ) {}

  async findTarget(
    manager: EntityManager,
    knowledgeBaseId: string,
    documentId: string,
    documentIndexId: string,
    generation: string,
  ): Promise<RagJobModel | null> {
    return manager.getRepository(RagJobModel).findOneBy({
      knowledgeBaseId,
      documentId,
      documentIndexId,
      generation,
    })
  }

  async findCurrentTarget(manager: EntityManager, knowledgeBaseId: string, documentId: string) {
    return manager.getRepository(RagJobModel).findOne({
      where: { knowledgeBaseId, documentId },
      lock: { mode: 'pessimistic_write' },
    })
  }

  async findActiveTarget(manager: EntityManager, knowledgeBaseId: string, documentId: string) {
    return manager.getRepository(RagJobModel).findOneBy({ knowledgeBaseId, documentId })
  }

  async createRetry(manager: EntityManager, input: RetryableRagJobAttributes) {
    const jobRepository = manager.getRepository(RagJobModel)

    return jobRepository.save(jobRepository.create(input))
  }

  async removeClaimed(manager: EntityManager, jobRecord: RagJobModel): Promise<void> {
    await manager.getRepository(RagJobModel).remove(jobRecord)
  }

  async removeForTarget(manager: EntityManager, knowledgeBaseId: string, documentId: string): Promise<void> {
    const jobs = manager.getRepository(RagJobModel)
    const targetJobs = await jobs.find({
      where: { knowledgeBaseId, documentId },
      lock: { mode: 'pessimistic_write' },
    })

    if (targetJobs.length) await jobs.remove(targetJobs)
  }

  async findForIndex(manager: EntityManager, documentIndexId: string, lock = false) {
    return manager.getRepository(RagJobModel).find({
      where: { documentIndexId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    })
  }

  async removeMany(manager: EntityManager, jobRecords: RagJobModel[]): Promise<void> {
    if (jobRecords.length) await manager.getRepository(RagJobModel).remove(jobRecords)
  }

  async findForTarget(manager: EntityManager, knowledgeBaseId: string, documentId: string, lock = false) {
    return manager.getRepository(RagJobModel).find({
      where: { knowledgeBaseId, documentId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    })
  }

  async findForDocumentIndex(manager: EntityManager, documentIndexId: string) {
    return manager.getRepository(RagJobModel).findOneBy({ documentIndexId })
  }

  async lockCurrentTarget(
    manager: EntityManager,
    knowledgeBaseId: string,
    documentId: string,
  ): Promise<RagJobModel | null> {
    return manager.getRepository(RagJobModel).findOne({
      where: { knowledgeBaseId, documentId },
      lock: { mode: 'pessimistic_write' },
    })
  }

  async saveQueuedTarget(manager: EntityManager, input: QueuedRagJobAttributes): Promise<RagJobModel> {
    const jobRepository = manager.getRepository(RagJobModel)

    return jobRepository.save(
      jobRepository.create({
        ...input,
        status: 'queued',
        attempts: 0,
        availableAt: new Date(),
        reservedAt: null,
        leaseToken: null,
      }),
    )
  }

  async remove(manager: EntityManager, job: RagJobModel): Promise<void> {
    await manager.getRepository(RagJobModel).remove(job)
  }

  async lockById(manager: EntityManager, jobId: string): Promise<RagJobModel | null> {
    return manager.getRepository(RagJobModel).findOne({
      where: { id: jobId },
      lock: { mode: 'pessimistic_write' },
    })
  }

  async save(manager: EntityManager, job: RagJobModel): Promise<RagJobModel> {
    return manager.getRepository(RagJobModel).save(job)
  }

  async jobStatus(projectId: string, id: string): Promise<RagJobStatusDto> {
    const activeJob = await this.jobs
      .createQueryBuilder('job')
      .innerJoin('knowledge_bases', 'knowledgeBase', 'knowledgeBase.id = job.knowledge_base_id')
      .where('job.id = :id', { id })
      .andWhere('knowledgeBase.project_id = :projectId', { projectId })
      .getOne()
    const failedJob = activeJob ? null : await this.findFailedJob(id)

    if (!activeJob && failedJob) {
      const failedJobKnowledgeBase = await this.memberships.manager
        .getRepository(RagKnowledgeBaseModel)
        .findOneBy({ id: failedJob.knowledgeBaseId, projectId })

      if (!failedJobKnowledgeBase) throw new KnowledgeJobNotFoundException(id)
    }

    const knowledgeBaseId = activeJob?.knowledgeBaseId ?? failedJob?.knowledgeBaseId
    const documentId = activeJob?.documentId ?? failedJob?.documentId
    const targetIndexId = activeJob?.documentIndexId ?? failedJob?.documentIndexId
    const targetGeneration = activeJob?.generation ?? failedJob?.generation

    if (!knowledgeBaseId || !documentId || !targetIndexId || !targetGeneration)
      throw new KnowledgeJobNotFoundException(id)

    const membership = await this.memberships.findOneBy({ knowledgeBaseId, documentId })
    const activeIndex = membership?.activeDocumentIndexId
      ? await this.indexes.findOneBy({ id: membership.activeDocumentIndexId })
      : null
    const targetIndex = await this.indexes.findOneBy({ id: targetIndexId })
    const state: RagJobTargetStateEnum =
      membership?.requestedGeneration !== targetGeneration
        ? RagJobTargetStateEnum.SUPERSEDED
        : activeJob
          ? activeJob.status === 'running'
            ? RagJobTargetStateEnum.RUNNING
            : RagJobTargetStateEnum.QUEUED
          : failedJob
            ? RagJobTargetStateEnum.FAILED
            : targetIndex?.status === 'ready'
              ? RagJobTargetStateEnum.READY
              : RagJobTargetStateEnum.FAILED

    return {
      activeIndex: activeIndex
        ? { id: activeIndex.id, status: activeIndex.status, readyAt: activeIndex.readyAt }
        : null,
      requestedTarget: {
        indexId: targetIndexId,
        generation: targetGeneration,
        state,
        jobId: activeJob?.id ?? null,
        failedJobId: failedJob?.id ?? null,
        attempts: activeJob?.attempts ?? failedJob?.attempts ?? null,
        errorCode: failedJob?.errorCode ?? null,
        errorMessage: failedJob?.errorMessage ?? null,
        executionVerification: this.toExecutionVerification(activeJob?.executionVerification ?? null),
      },
    }
  }

  private toExecutionVerification(verification: Record<string, unknown> | null): RagExecutionVerification | null {
    if (!verification) return null

    const stage = verification.stage
    const completedUnits = verification.completedUnits
    const rawTotalUnits = verification.totalUnits
    const rawVerifiedAt = verification.verifiedAt

    if (
      !this.isVerificationStage(stage) ||
      typeof completedUnits !== 'number' ||
      !(typeof rawTotalUnits === 'number' || rawTotalUnits === null) ||
      !(typeof rawVerifiedAt === 'string' || rawVerifiedAt === null)
    )
      return null

    const totalUnits: number | null = typeof rawTotalUnits === 'number' ? rawTotalUnits : null
    const verifiedAt: string | null = typeof rawVerifiedAt === 'string' ? rawVerifiedAt : null
    const claimToken = verification.claim_token
    const leaseExpiresAt = verification.lease_expires_at

    return {
      stage,
      completedUnits,
      totalUnits,
      verifiedAt,
      ...(typeof claimToken === 'string' ? { claimToken } : {}),
      ...(typeof leaseExpiresAt === 'string' ? { leaseExpiresAt } : {}),
    }
  }

  private isVerificationStage(stage: unknown): stage is RagExecutionStageEnum {
    return typeof stage === 'string' && Object.values(RagExecutionStageEnum).includes(stage as RagExecutionStageEnum)
  }

  async claimNext(): Promise<ClaimedRagIndexJob | null> {
    const claimTimestamp = new Date()
    const expiredLeaseCutoff = new Date(claimTimestamp.getTime() - this.config.workerLeaseSeconds * 1000)

    return this.jobs.manager.transaction(async (transaction) => {
      const jobs = transaction.getRepository(RagJobModel)
      const expiredLeases = await jobs
        .createQueryBuilder('job')
        .where('job.status = :status', { status: 'running' })
        .andWhere('job.reservedAt <= :expiredLeaseCutoff', { expiredLeaseCutoff })
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany()

      const exhaustedLeases = expiredLeases.filter((job) => job.attempts >= 4)

      if (exhaustedLeases.length) {
        await this.failedJobRepository.archiveExpiredLeases(transaction, exhaustedLeases, claimTimestamp)
        await jobs.remove(exhaustedLeases)
      }

      const retryableLeases = expiredLeases.filter((job) => job.attempts < 4)

      for (const expiredJob of retryableLeases) {
        expiredJob.status = 'queued'
        expiredJob.availableAt = new Date(claimTimestamp.getTime() + Math.min(60_000, 1000 * 2 ** expiredJob.attempts))
        expiredJob.reservedAt = null
        expiredJob.leaseToken = null
        expiredJob.executionVerification = null
        expiredJob.executionState = {
          ...(expiredJob.executionState ?? {}),
          lastError: {
            code: 'INDEXING_LEASE_EXPIRED',
            message: 'Indexing worker lease expired',
            failedAt: claimTimestamp.toISOString(),
          },
        }
      }

      if (retryableLeases.length) await jobs.save(retryableLeases)

      while (true) {
        const jobToClaim = await jobs
          .createQueryBuilder('job')
          .where('job.status = :queued', { queued: 'queued' })
          .andWhere('job.availableAt <= :claimTimestamp', { claimTimestamp })
          .orderBy('job.createdAt', 'ASC')
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .getOne()

        if (!jobToClaim) return null

        const documentIndex = await transaction.getRepository(RagDocumentIndexModel).findOne({
          where: { id: jobToClaim.documentIndexId },
          lock: { mode: 'pessimistic_write' },
        })

        if (documentIndex?.status === 'ready') {
          const membershipRepo = transaction.getRepository(RagMembershipModel)
          const membership = await membershipRepo.findOne({
            where: { knowledgeBaseId: jobToClaim.knowledgeBaseId, documentId: jobToClaim.documentId },
            lock: { mode: 'pessimistic_write' },
          })

          if (membership && membership.requestedGeneration === jobToClaim.generation) {
            const previousIndexId = membership.activeDocumentIndexId
            membership.activeDocumentIndexId = documentIndex.id
            await membershipRepo.save(membership)

            if (previousIndexId && previousIndexId !== documentIndex.id) {
              const previousIndex = await transaction.getRepository(RagDocumentIndexModel).findOneBy({
                id: previousIndexId,
              })

              if (previousIndex) {
                previousIndex.unreferencedSince = new Date()
                await transaction.getRepository(RagDocumentIndexModel).save(previousIndex)
              }
            }
          }

          await jobs.remove(jobToClaim)
          continue
        }

        if (documentIndex) {
          const activeSibling = await jobs.findOneBy({
            id: Not(jobToClaim.id),
            documentIndexId: documentIndex.id,
            status: 'running',
            reservedAt: MoreThan(expiredLeaseCutoff),
          })

          if (activeSibling) return null
        }

        jobToClaim.status = 'running'
        jobToClaim.attempts += 1
        jobToClaim.reservedAt = claimTimestamp
        jobToClaim.leaseToken = randomUUID()
        const leaseExpiresAt = new Date(claimTimestamp.getTime() + this.config.workerLeaseSeconds * 1000)
        const leaseExpiresAtIso = leaseExpiresAt.toISOString()
        jobToClaim.executionVerification = {
          stage: RagExecutionStageEnum.CLAIMED,
          completedUnits: 0,
          totalUnits: null,
          verifiedAt: claimTimestamp.toISOString(),
          claim_token: jobToClaim.leaseToken,
          lease_expires_at: leaseExpiresAtIso,
        }
        await jobs.save(jobToClaim)

        return {
          id: jobToClaim.id,
          knowledgeBaseId: jobToClaim.knowledgeBaseId,
          documentId: jobToClaim.documentId,
          documentIndexId: jobToClaim.documentIndexId,
          generation: jobToClaim.generation,
          attempts: jobToClaim.attempts,
          leaseToken: jobToClaim.leaseToken,
          leaseExpiresAt,
          executionVerification: this.toExecutionVerification(jobToClaim.executionVerification) ?? {
            stage: RagExecutionStageEnum.CLAIMED,
            completedUnits: 0,
            totalUnits: null,
            verifiedAt: claimTimestamp.toISOString(),
            claimToken: jobToClaim.leaseToken,
            leaseExpiresAt: leaseExpiresAtIso,
          },
        }
      }
    })
  }

  async heartbeat(claimedJob: ClaimedRagIndexJob, progress: RagJobProgress): Promise<void> {
    await this.jobs.manager.transaction(async (transaction) => {
      const jobRecord = await this.lockById(transaction, claimedJob.id)
      this.assertLeaseOwnership(jobRecord, claimedJob)
      const heartbeatTimestamp = new Date()
      jobRecord.reservedAt = heartbeatTimestamp
      const leaseExpiresAt = new Date(heartbeatTimestamp.getTime() + this.config.workerLeaseSeconds * 1000)
      jobRecord.executionVerification = {
        ...progress,
        verifiedAt: heartbeatTimestamp.toISOString(),
        claim_token: claimedJob.leaseToken,
        lease_expires_at: leaseExpiresAt.toISOString(),
      }
      await this.save(transaction, jobRecord)
    })
  }

  private async findFailedJob(id: string) {
    return this.failedJobRepository.findByIdOrJobId(id)
  }

  assertLeaseOwnership(
    jobRecord: RagJobModel | null,
    claimedJob: ClaimedRagIndexJob,
  ): asserts jobRecord is RagJobModel {
    const leaseCutoff = Date.now() - this.config.workerLeaseSeconds * 1000

    if (
      !jobRecord ||
      jobRecord.status !== 'running' ||
      jobRecord.leaseToken !== claimedJob.leaseToken ||
      jobRecord.generation !== claimedJob.generation ||
      jobRecord.documentIndexId !== claimedJob.documentIndexId ||
      !jobRecord.reservedAt ||
      jobRecord.reservedAt.getTime() <= leaseCutoff
    ) {
      throw new InvalidRagJobLeaseException()
    }
  }

  hasActiveLease(jobRecord: RagJobModel): boolean {
    return (
      jobRecord.status === 'running' &&
      jobRecord.reservedAt !== null &&
      jobRecord.reservedAt.getTime() > Date.now() - this.config.workerLeaseSeconds * 1000
    )
  }

  async countForIndex(manager: EntityManager, documentIndexId: string): Promise<number> {
    return manager.getRepository(RagJobModel).countBy({ documentIndexId })
  }
}
