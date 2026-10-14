import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThanOrEqual, Not, type EntityManager, Repository } from 'typeorm'

import type { RagJobClaim } from '../../../Application/KnowledgeBases/Contracts/rag-job-claim-transaction.js'
import { RAG_JOB_STATUS } from '../../../Domain/Knowledge/rag-job.js'
import { RagJobModel } from '../Models/rag-job.model.js'

/** Job-only query and lock operations used by the claim transaction adapter. */
@Injectable()
export class TypeOrmRagJobClaimRepository {
  constructor(@InjectRepository(RagJobModel) private readonly jobs: Repository<RagJobModel>) {}

  get manager(): EntityManager {
    return this.jobs.manager
  }

  async findExpiredSnapshotsIn(manager: EntityManager, now: Date): Promise<RagJobModel[]> {
    return manager
      .getRepository(RagJobModel)
      .createQueryBuilder('job')
      .where('job.status = :status', { status: RAG_JOB_STATUS.RUNNING })
      .andWhere(
        "COALESCE(NULLIF(job.executionVerification ->> 'lease_expires_at', '')::timestamptz, '-infinity'::timestamptz) <= :now",
        { now },
      )
      .orderBy('job.documentId', 'ASC')
      .addOrderBy('job.knowledgeBaseId', 'ASC')
      .addOrderBy('job.id', 'ASC')
      .getMany()
  }

  async lockExpiredIn(manager: EntityManager, jobId: string, now: Date): Promise<RagJobModel | null> {
    return manager
      .getRepository(RagJobModel)
      .createQueryBuilder('job')
      .where('job.id = :jobId', { jobId })
      .andWhere('job.status = :status', { status: RAG_JOB_STATUS.RUNNING })
      .andWhere(
        "COALESCE(NULLIF(job.executionVerification ->> 'lease_expires_at', '')::timestamptz, '-infinity'::timestamptz) <= :now",
        { now },
      )
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .getOne()
  }

  async countQueuedCandidatesIn(manager: EntityManager, availableAt: Date): Promise<number> {
    return manager.getRepository(RagJobModel).countBy({
      status: RAG_JOB_STATUS.QUEUED,
      availableAt: LessThanOrEqual(availableAt),
    })
  }

  async findQueuedSnapshotIn(
    manager: EntityManager,
    availableAt: Date,
    excludedDocumentIndexIds: ReadonlyArray<string>,
  ): Promise<RagJobModel | null> {
    const query = manager
      .getRepository(RagJobModel)
      .createQueryBuilder('job')
      .where('job.status = :status', { status: RAG_JOB_STATUS.QUEUED })
      .andWhere('job.availableAt <= :availableAt', { availableAt })

    if (excludedDocumentIndexIds.length > 0) {
      query.andWhere('job.documentIndexId NOT IN (:...excludedDocumentIndexIds)', {
        excludedDocumentIndexIds: [...excludedDocumentIndexIds],
      })
    }

    return query.orderBy('job.createdAt', 'ASC').addOrderBy('job.id', 'ASC').getOne()
  }

  async lockQueuedIn(manager: EntityManager, jobId: string, availableAt: Date): Promise<RagJobModel | null> {
    return manager
      .getRepository(RagJobModel)
      .createQueryBuilder('job')
      .where('job.id = :jobId', { jobId })
      .andWhere('job.status = :status', { status: RAG_JOB_STATUS.QUEUED })
      .andWhere('job.availableAt <= :availableAt', { availableAt })
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .getOne()
  }

  async findRunningSiblingsIn(manager: EntityManager, documentIndexId: string, jobId: string): Promise<RagJobModel[]> {
    return manager.getRepository(RagJobModel).find({
      where: { documentIndexId, status: RAG_JOB_STATUS.RUNNING, id: Not(jobId) },
      select: { id: true, status: true, attempts: true, executionVerification: true },
    })
  }

  async retryExpiredIn(
    manager: EntityManager,
    jobId: string,
    retryAt: Date,
    executionState: Record<string, unknown>,
  ): Promise<void> {
    const repository = manager.getRepository(RagJobModel)
    const job = await repository.findOneBy({ id: jobId, status: RAG_JOB_STATUS.RUNNING })

    if (!job) return

    job.status = RAG_JOB_STATUS.QUEUED
    job.availableAt = retryAt
    job.reservedAt = null
    job.leaseToken = null
    job.executionVerification = null
    job.executionState = executionState
    await repository.save(job)
  }

  async discardQueuedIn(manager: EntityManager, jobId: string): Promise<boolean> {
    const result = await manager.getRepository(RagJobModel).delete({ id: jobId, status: RAG_JOB_STATUS.QUEUED })

    return (result.affected ?? 0) === 1
  }

  async removeExpiredIn(manager: EntityManager, jobId: string): Promise<void> {
    await manager.getRepository(RagJobModel).delete({ id: jobId, status: RAG_JOB_STATUS.RUNNING })
  }

  async claimQueuedIn(
    manager: EntityManager,
    jobId: string,
    claimedAt: Date,
    claim: RagJobClaim,
  ): Promise<RagJobModel> {
    const repository = manager.getRepository(RagJobModel)
    const job = await repository.findOne({ where: { id: jobId }, lock: { mode: 'pessimistic_write' } })

    if (!job || job.status !== RAG_JOB_STATUS.QUEUED) throw new Error(`Queued RAG job ${jobId} is no longer available`)

    job.status = RAG_JOB_STATUS.RUNNING
    job.attempts = claim.attempts
    job.reservedAt = claimedAt
    job.leaseToken = claim.leaseToken
    job.executionVerification = {
      ...claim.executionVerification,
      claim_token: claim.leaseToken,
      lease_expires_at: claim.leaseExpiresAt.toISOString(),
    }

    return repository.save(job)
  }
}
