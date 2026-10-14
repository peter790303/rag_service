import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { EntityManager } from 'typeorm'

import type { RagJobProgressContract } from '../../../Application/KnowledgeBases/Contracts/rag-indexing-repository.js'
import type { ClaimedRagIndexJobContract } from '../../../Application/KnowledgeBases/Contracts/rag-job-claim-transaction.js'
import { InvalidRagJobLeaseException } from '../../../Domain/Knowledge/Exceptions/invalid-rag-job-lease.exception.js'
import { RAG_JOB_STATUS, type RagJobStatus } from '../../../Domain/Knowledge/rag-job.js'
import { RagJobFactory } from '../Factories/rag-job.factory.js'
import { RagJobModel } from '../Models/rag-job.model.js'

type RetryableRagJobAttributes = {
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
  generation: string
  status: RagJobStatus
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
  status: RagJobStatus
  attempts: number
  availableAt: Date
  idempotencyKey: string | null
  retryOfFailedJobId: string | null
  payload: Record<string, unknown>
  executionState: Record<string, unknown> | null
  executionVerification: Record<string, unknown> | null
}

/** Job-primary persistence operations, including atomic worker claiming. */
@Injectable()
export class TypeOrmRagJobRepository {
  async countForDocumentIn(manager: EntityManager, documentId: string): Promise<number> {
    return manager.getRepository(RagJobModel).countBy({ documentId })
  }

  constructor(@InjectRepository(RagJobModel) private readonly jobs: Repository<RagJobModel>) {}

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

  async findByGeneration(
    manager: EntityManager,
    knowledgeBaseId: string,
    documentId: string,
    generation: string,
  ): Promise<RagJobModel | null> {
    return manager.getRepository(RagJobModel).findOneBy({ knowledgeBaseId, documentId, generation })
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

  async findByIdInProject(projectId: string, id: string): Promise<RagJobModel | null> {
    return this.jobs.findOne({ where: { id, knowledgeBase: { projectId } } })
  }

  async heartbeat(
    transaction: EntityManager,
    claimedJob: ClaimedRagIndexJobContract,
    progress: RagJobProgressContract,
    now: Date,
    leaseExpiresAt: Date,
  ): Promise<void> {
    const jobRecord = await this.lockById(transaction, claimedJob.id)
    this.assertLeaseOwnership(jobRecord, claimedJob, now)

    if (!RagJobFactory.toRunningDomain(jobRecord).canRenewLeaseAt(now, leaseExpiresAt)) {
      throw new InvalidRagJobLeaseException()
    }

    jobRecord.reservedAt = now
    jobRecord.executionVerification = {
      ...progress,
      verifiedAt: now.toISOString(),
      claim_token: claimedJob.leaseToken,
      lease_expires_at: leaseExpiresAt.toISOString(),
    }
    await this.save(transaction, jobRecord)
  }

  assertLeaseOwnership(
    jobRecord: RagJobModel | null,
    claimedJob: ClaimedRagIndexJobContract,
    now: Date,
  ): asserts jobRecord is RagJobModel {
    if (
      !jobRecord ||
      jobRecord.status !== RAG_JOB_STATUS.RUNNING ||
      jobRecord.leaseToken !== claimedJob.leaseToken ||
      jobRecord.generation !== claimedJob.generation ||
      jobRecord.documentIndexId !== claimedJob.documentIndexId ||
      jobRecord.knowledgeBaseId !== claimedJob.knowledgeBaseId ||
      jobRecord.documentId !== claimedJob.documentId ||
      jobRecord.attempts !== claimedJob.attempts ||
      !RagJobFactory.toRunningDomain(jobRecord).hasActiveLeaseAt(now)
    ) {
      throw new InvalidRagJobLeaseException()
    }
  }

  async countForIndex(manager: EntityManager, documentIndexId: string): Promise<number> {
    return manager.getRepository(RagJobModel).countBy({ documentIndexId })
  }

  async countRetriesForFailedJob(manager: EntityManager, failedJobId: string): Promise<number> {
    return manager.getRepository(RagJobModel).countBy({ retryOfFailedJobId: failedJobId })
  }
}
