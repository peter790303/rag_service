import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, LessThanOrEqual, type EntityManager, Repository } from 'typeorm'

import type { RagFailedJobArchive } from '../../../Application/KnowledgeBases/Contracts/rag-job-claim-transaction.js'
import { RagFailedJobModel } from '../Models/rag-failed-job.model.js'

type FailedRagJobAttributes = {
  jobId: string
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
  generation: string
  attempts: number
  errorCode: string | null
  errorMessage: string | null
  blockedReasons: unknown[]
  retryPayload: Record<string, unknown>
  failedAt: Date
  retriedAt: Date | null
}

/** Failed-job-primary persistence operations. */
@Injectable()
export class TypeOrmRagFailedJobRepository {
  constructor(@InjectRepository(RagFailedJobModel) private readonly failedJobs: Repository<RagFailedJobModel>) {}

  async findByIdOrJobIdInProject(idOrJobId: string, projectId: string): Promise<RagFailedJobModel | null> {
    return this.failedJobs.findOne({
      where: [
        { id: idOrJobId, knowledgeBase: { projectId } },
        { jobId: idOrJobId, knowledgeBase: { projectId } },
      ],
    })
  }

  async lockById(manager: EntityManager, failedJobId: string): Promise<RagFailedJobModel | null> {
    return manager.getRepository(RagFailedJobModel).findOne({
      where: { id: failedJobId },
      lock: { mode: 'pessimistic_write' },
    })
  }

  async findCurrentUnretried(
    manager: EntityManager,
    knowledgeBaseId: string,
    documentId: string,
    documentIndexId: string,
    generation: string,
  ): Promise<RagFailedJobModel | null> {
    return manager.getRepository(RagFailedJobModel).findOneBy({
      knowledgeBaseId,
      documentId,
      documentIndexId,
      generation,
      retriedAt: IsNull(),
    })
  }

  async save(manager: EntityManager, failedJob: RagFailedJobModel): Promise<RagFailedJobModel> {
    return manager.getRepository(RagFailedJobModel).save(failedJob)
  }

  async markRetried(manager: EntityManager, failedJobId: string, retriedAt: Date): Promise<void> {
    await manager.getRepository(RagFailedJobModel).update({ id: failedJobId }, { retriedAt, updatedAt: retriedAt })
  }

  async createAndSave(manager: EntityManager, attributes: FailedRagJobAttributes): Promise<RagFailedJobModel> {
    const failedJobRepository = manager.getRepository(RagFailedJobModel)

    return failedJobRepository.save(failedJobRepository.create(attributes))
  }

  async saveMany(manager: EntityManager, failedJobs: RagFailedJobModel[]): Promise<RagFailedJobModel[]> {
    return manager.getRepository(RagFailedJobModel).save(failedJobs)
  }

  async createAndSaveMany(manager: EntityManager, attributes: ReadonlyArray<RagFailedJobArchive>): Promise<void> {
    if (attributes.length === 0) return

    const failedJobRepository = manager.getRepository(RagFailedJobModel)
    await failedJobRepository.save(failedJobRepository.create([...attributes]))
  }

  async findByDocumentTarget(
    manager: EntityManager,
    knowledgeBaseId: string,
    documentId: string,
  ): Promise<RagFailedJobModel[]> {
    return manager.getRepository(RagFailedJobModel).findBy({ knowledgeBaseId, documentId })
  }

  async findByIndex(manager: EntityManager, documentIndexId: string): Promise<RagFailedJobModel[]> {
    return manager.getRepository(RagFailedJobModel).findBy({ documentIndexId })
  }

  async removeMany(manager: EntityManager, failedJobs: RagFailedJobModel[]): Promise<void> {
    if (failedJobs.length) await manager.getRepository(RagFailedJobModel).remove(failedJobs)
  }

  async findByIdIn(manager: EntityManager, id: string): Promise<RagFailedJobModel | null> {
    return manager.getRepository(RagFailedJobModel).findOneBy({ id })
  }

  async countForDocumentIn(manager: EntityManager, documentId: string): Promise<number> {
    return manager.getRepository(RagFailedJobModel).countBy({ documentId })
  }

  async countForIndex(manager: EntityManager, documentIndexId: string): Promise<number> {
    return manager.getRepository(RagFailedJobModel).countBy({ documentIndexId })
  }

  async findGarbageCandidates(
    manager: EntityManager,
    cutoff: Date,
  ): Promise<Array<{ failedJobId: string; documentId: string; failedAt: Date }>> {
    const candidates = await manager.getRepository(RagFailedJobModel).find({
      where: { failedAt: LessThanOrEqual(cutoff) },
      select: { id: true, documentId: true, failedAt: true },
    })

    return candidates.map(({ id, documentId, failedAt }) => ({ failedJobId: id, documentId, failedAt }))
  }

  async lockForGarbageCollection(
    manager: EntityManager,
    failedJobId: string,
  ): Promise<{ failedJobId: string; documentId: string; failedAt: Date } | null> {
    const failedJob = await manager
      .getRepository(RagFailedJobModel)
      .createQueryBuilder('failed')
      .where('failed.id = :failedJobId', { failedJobId })
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .getOne()

    return failedJob
      ? { failedJobId: failedJob.id, documentId: failedJob.documentId, failedAt: failedJob.failedAt }
      : null
  }

  async removeForGarbageCollection(manager: EntityManager, failedJobId: string): Promise<void> {
    await manager.getRepository(RagFailedJobModel).delete({ id: failedJobId })
  }
}
