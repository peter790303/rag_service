import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, type EntityManager, Repository } from 'typeorm'

import { packRetryPayload } from './rag-retry-payload.js'
import { RagFailedJobModel } from '../Models/rag-failed-job.model.js'
import type { RagJobModel } from '../Models/rag-job.model.js'

type ExpiredRagJob = Pick<
  RagJobModel,
  'id' | 'knowledgeBaseId' | 'documentId' | 'documentIndexId' | 'generation' | 'attempts' | 'payload' | 'executionState'
>

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

  async findByIdOrJobId(idOrJobId: string): Promise<RagFailedJobModel | null> {
    return this.failedJobs.findOne({ where: [{ id: idOrJobId }, { jobId: idOrJobId }] })
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

  async createAndSave(manager: EntityManager, attributes: FailedRagJobAttributes): Promise<RagFailedJobModel> {
    const failedJobRepository = manager.getRepository(RagFailedJobModel)

    return failedJobRepository.save(failedJobRepository.create(attributes))
  }

  async saveMany(manager: EntityManager, failedJobs: RagFailedJobModel[]): Promise<RagFailedJobModel[]> {
    return manager.getRepository(RagFailedJobModel).save(failedJobs)
  }

  async archiveExpiredLeases(
    manager: EntityManager,
    exhaustedJobs: ReadonlyArray<ExpiredRagJob>,
    failedAt: Date,
  ): Promise<void> {
    const failedJobRepository = manager.getRepository(RagFailedJobModel)
    await failedJobRepository.save(
      exhaustedJobs.map((exhaustedJob) =>
        failedJobRepository.create({
          jobId: exhaustedJob.id,
          knowledgeBaseId: exhaustedJob.knowledgeBaseId,
          documentId: exhaustedJob.documentId,
          documentIndexId: exhaustedJob.documentIndexId,
          generation: exhaustedJob.generation,
          attempts: exhaustedJob.attempts,
          errorCode: 'INDEXING_LEASE_EXPIRED',
          errorMessage: 'Indexing worker lease expired after the final attempt',
          blockedReasons: [],
          retryPayload: packRetryPayload(exhaustedJob.payload, {
            ...(exhaustedJob.executionState ?? {}),
            lastError: {
              code: 'INDEXING_LEASE_EXPIRED',
              message: 'Indexing worker lease expired after the final attempt',
              failedAt: failedAt.toISOString(),
            },
          }),
          failedAt,
          retriedAt: null,
        }),
      ),
    )
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

  async countForIndex(manager: EntityManager, documentIndexId: string): Promise<number> {
    return manager.getRepository(RagFailedJobModel).countBy({ documentIndexId })
  }

  async deleteExpiredUnreferenced(manager: EntityManager, cutoff: Date): Promise<number> {
    const schema = (manager.connection.options as { schema?: string }).schema ?? 'public'
    const qualifiedSchema = `"${schema.replaceAll('"', '""')}"`
    const [, deletedCount] = (await manager.query(
      `WITH eligible AS (
         SELECT failed.id
         FROM ${qualifiedSchema}.failed_jobs AS failed
         WHERE failed.failed_at <= $1
           AND NOT EXISTS (
             SELECT 1 FROM ${qualifiedSchema}.jobs AS job WHERE job.retry_of_failed_job_id = failed.id
           )
         FOR UPDATE SKIP LOCKED
       )
       DELETE FROM ${qualifiedSchema}.failed_jobs AS failed
       USING eligible
       WHERE failed.id = eligible.id
       RETURNING failed.id`,
      [cutoff],
    )) as [Array<{ id: string }>, number]

    return deletedCount
  }
}
