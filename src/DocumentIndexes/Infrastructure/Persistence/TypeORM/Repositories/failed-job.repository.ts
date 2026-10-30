import { Injectable } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { In, IsNull, LessThanOrEqual } from 'typeorm'

import { PersistenceTransaction } from '../../../../../Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import type { DocumentIndexFailureRecordDTO } from '../../../../Application/DataTransferObjects/document-index-failure-record.dto.ts'
import type { ExpiredDocumentIndexFailureDTO } from '../../../../Application/DataTransferObjects/expired-document-index-failure.dto.ts'
import { DocumentIndexFailureArchive } from '../../../../Application/Ports/Out/Gateways/document-index-failure.archive.ts'
import type {
  ArchiveDocumentIndexFailureParams,
  ArchiveDocumentIndexFailuresParams,
  RemoveDocumentIndexFailuresParams,
} from '../../../../Application/Ports/Out/Gateways/document-index-failure.params.ts'
import type {
  DocumentIndexFailureDocumentParams,
  DocumentIndexFailureKnowledgeBaseDocumentParams,
  ExpiredDocumentIndexFailuresParams,
  DocumentIndexFailureIdParams,
  DocumentIndexFailureInProjectParams,
  DocumentIndexFailureIndexParams,
  DocumentIndexFailureLookupParams,
  UnretriedDocumentIndexFailureTargetParams,
  UnretriedDocumentIndexFailuresParams,
} from '../../../../Application/Ports/Out/Gateways/document-index-failure.params.ts'
import { FailedJobRecordAdapter } from '../Mappers/failed-job-record.adapter.ts'
import { FailedJobRetentionFactsAdapter } from '../Mappers/failed-job-retention-facts.adapter.ts'
import { FailedJobModel } from '../Models/failed-job.model.ts'

/** Persists document-index failure history in the current transaction. */
@Injectable()
export class FailedJobRepository extends DocumentIndexFailureArchive {
  constructor(private readonly persistenceTransaction: PersistenceTransaction) {
    super()
  }

  private get failedJobModelRepository(): Repository<FailedJobModel> {
    return this.persistenceTransaction.manager.getRepository(FailedJobModel)
  }

  async findFailureInProject(
    failedJobInProjectQO: DocumentIndexFailureInProjectParams,
  ): Promise<DocumentIndexFailureRecordDTO | null> {
    const { idOrJobId, projectId } = failedJobInProjectQO

    return FailedJobRecordAdapter.toNullableRecord(
      await this.failedJobModelRepository.findOne({
        where: [
          { id: idOrJobId, knowledgeBase: { projectId } },
          { jobId: idOrJobId, knowledgeBase: { projectId } },
        ],
      }),
    )
  }

  async lockFailure(failedJobIdQO: DocumentIndexFailureIdParams): Promise<DocumentIndexFailureRecordDTO | null> {
    const { failedJobId } = failedJobIdQO

    return FailedJobRecordAdapter.toNullableRecord(
      await this.failedJobModelRepository.findOne({
        where: { id: failedJobId },
        lock: { mode: 'pessimistic_write' },
      }),
    )
  }

  async findUnretriedTargetFailure(
    unretriedFailedJobTargetQO: UnretriedDocumentIndexFailureTargetParams,
  ): Promise<DocumentIndexFailureRecordDTO | null> {
    const { knowledgeBaseId, documentId, documentIndexId, generation } = unretriedFailedJobTargetQO

    return FailedJobRecordAdapter.toNullableRecord(
      await this.failedJobModelRepository.findOneBy({
        knowledgeBaseId,
        documentId,
        documentIndexId,
        generation,
        retriedAt: IsNull(),
      }),
    )
  }

  async findByRetriedAtIsNullAndFailedAtLessThanOrEqualCutoffOrderByFailedAtAscAndIdAsc(
    query: UnretriedDocumentIndexFailuresParams,
  ): Promise<string[]> {
    const { cutoff, failedJobId, projectId } = query
    const where = {
      retriedAt: IsNull(),
      failedAt: LessThanOrEqual(cutoff),
      ...(failedJobId === undefined ? {} : { id: failedJobId }),
      ...(projectId === undefined ? {} : { knowledgeBase: { projectId } }),
    }

    const failures = await this.failedJobModelRepository.find({
      where,
      select: { id: true },
      order: { failedAt: 'ASC', id: 'ASC' },
    })

    return failures.map(({ id }) => id)
  }

  async archive(saveFailedJobQO: ArchiveDocumentIndexFailureParams): Promise<void> {
    await this.failedJobModelRepository.insert(FailedJobRecordAdapter.toPersistence(saveFailedJobQO))
  }

  async removeFailure(failedJobIdQO: DocumentIndexFailureIdParams): Promise<void> {
    const { failedJobId } = failedJobIdQO

    await this.failedJobModelRepository.delete({ id: failedJobId })
  }

  async insertMany(insertFailedJobsQO: ArchiveDocumentIndexFailuresParams): Promise<void> {
    if (insertFailedJobsQO.failedJobs.length === 0) return

    const failureAttributes = FailedJobRecordAdapter.toPersistenceRecords(insertFailedJobsQO.failedJobs)
    await this.failedJobModelRepository.insert(failureAttributes)
  }

  async findByKnowledgeBaseIdAndDocumentId(
    failedJobDocumentTargetQO: DocumentIndexFailureKnowledgeBaseDocumentParams,
  ): Promise<DocumentIndexFailureRecordDTO[]> {
    const { knowledgeBaseId, documentId } = failedJobDocumentTargetQO

    return FailedJobRecordAdapter.toRecords(await this.failedJobModelRepository.findBy({ knowledgeBaseId, documentId }))
  }

  async findByDocumentIndexId(
    failedJobIndexQO: DocumentIndexFailureIndexParams,
  ): Promise<DocumentIndexFailureRecordDTO[]> {
    const { documentIndexId } = failedJobIndexQO

    return FailedJobRecordAdapter.toRecords(await this.failedJobModelRepository.findBy({ documentIndexId }))
  }

  async deleteByIds(removeFailedJobsQO: RemoveDocumentIndexFailuresParams): Promise<void> {
    if (!removeFailedJobsQO.failedJobIds.length) return

    await this.failedJobModelRepository.delete({ id: In(removeFailedJobsQO.failedJobIds) })
  }

  async findFailure(
    failedJobLookupQO: DocumentIndexFailureLookupParams,
  ): Promise<DocumentIndexFailureRecordDTO | null> {
    const { id } = failedJobLookupQO

    return FailedJobRecordAdapter.toNullableRecord(await this.failedJobModelRepository.findOneBy({ id }))
  }

  async countDocumentFailures(failedJobDocumentQO: DocumentIndexFailureDocumentParams): Promise<number> {
    const { documentId } = failedJobDocumentQO

    return this.failedJobModelRepository.countBy({ documentId })
  }

  async countIndexFailures(failedJobIndexQO: DocumentIndexFailureIndexParams): Promise<number> {
    const { documentIndexId } = failedJobIndexQO

    return this.failedJobModelRepository.countBy({ documentIndexId })
  }

  async findExpiredFailures(
    failedJobGarbageQO: ExpiredDocumentIndexFailuresParams,
  ): Promise<ExpiredDocumentIndexFailureDTO[]> {
    const { cutoff } = failedJobGarbageQO

    const candidates = await this.failedJobModelRepository.find({
      where: { failedAt: LessThanOrEqual(cutoff) },
      select: { id: true, documentId: true, failedAt: true },
    })

    return FailedJobRetentionFactsAdapter.toGarbageFailedJobCandidates(candidates)
  }

  async lockExpiredFailure(
    failedJobIdQO: DocumentIndexFailureIdParams,
  ): Promise<ExpiredDocumentIndexFailureDTO | null> {
    const { failedJobId } = failedJobIdQO

    const failedJob = await this.failedJobModelRepository.findOne({
      where: { id: failedJobId },
      lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
    })

    return FailedJobRetentionFactsAdapter.toNullableGarbageFailedJobCandidate(failedJob)
  }

  async removeExpiredFailure(failedJobIdQO: DocumentIndexFailureIdParams): Promise<void> {
    const { failedJobId } = failedJobIdQO

    await this.failedJobModelRepository.delete({ id: failedJobId })
  }
}
