import { Injectable } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { In, IsNull, LessThanOrEqual, Not, type FindOptionsWhere } from 'typeorm'

import { DocumentIndexExecutionQueue } from '../../../Application/DocumentIndexes/Contracts/document-index-execution.queue.ts'
import type { DocumentIndexExecutionFactsDto } from '../../../Application/DocumentIndexes/DataTransferObjects/document-index-execution-facts.dto.ts'
import type { DocumentIndexExecutionRecordDto } from '../../../Application/DocumentIndexes/DataTransferObjects/document-index-execution-record.dto.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../Application/DocumentIndexes/Helpers/document-index-execution-lifecycle.helper.ts'
import type {
  ExpiredDocumentIndexExecutionQueryObject,
  ExpiredDocumentIndexExecutionsQueryObject,
  TransitionDocumentIndexExecutionQueryObject,
  AvailableDocumentIndexExecutionQueryObject,
  OldestAvailableDocumentIndexExecutionQueryObject,
  AvailableDocumentIndexExecutionsQueryObject,
  RunningDocumentIndexExecutionSiblingsQueryObject,
  EnqueueDocumentIndexingRetryQueryObject,
  EnqueueDocumentIndexExecutionQueryObject,
  SaveDocumentIndexExecutionQueryObject,
  RemoveDocumentIndexExecutionsQueryObject,
  RenewDocumentIndexExecutionLeaseQueryObject,
  RescheduleDocumentIndexExecutionQueryObject,
} from '../../../Application/DocumentIndexes/QueryObjects/document-index-execution.query-object.ts'
import type {
  DocumentIndexExecutionDocumentQueryObject,
  DocumentIndexExecutionMembershipQueryObject,
  DocumentIndexExecutionGenerationQueryObject,
  DocumentIndexExecutionIdQueryObject,
  DocumentIndexExecutionInProjectQueryObject,
  DocumentIndexExecutionIndexQueryObject,
  DocumentIndexExecutionRetrySourceQueryObject,
  DocumentIndexExecutionTargetQueryObject,
  DocumentIndexExecutionsForIndexQueryObject,
  DocumentIndexExecutionsForMembershipQueryObject,
} from '../../../Application/DocumentIndexes/QueryObjects/document-index-execution.query-object.ts'
import { JobRecordAdapter } from '../Adapters/job-record.adapter.ts'
import { JobWriteAdapter } from '../Adapters/job-write.adapter.ts'
import { JobModel } from '../Models/job.model.ts'
import { PersistenceTransaction } from '../persistence-transaction.ts'

/** Persists document-index deliveries and leases in the current transaction. */
@Injectable()
export class JobRepository extends DocumentIndexExecutionQueue {
  async countDocumentExecutions(jobDocumentQO: DocumentIndexExecutionDocumentQueryObject): Promise<number> {
    const { documentId } = jobDocumentQO

    return this.jobModelRepository.countBy({ documentId })
  }

  constructor(private readonly persistenceTransaction: PersistenceTransaction) {
    super()
  }

  private get jobModelRepository(): Repository<JobModel> {
    return this.persistenceTransaction.manager.getRepository(JobModel)
  }

  async findByKnowledgeBaseIdAndDocumentIdAndDocumentIndexIdAndGeneration(
    jobTargetQO: DocumentIndexExecutionTargetQueryObject,
  ): Promise<DocumentIndexExecutionRecordDto | null> {
    const { knowledgeBaseId, documentId, documentIndexId, generation } = jobTargetQO

    return JobRecordAdapter.toNullableRecord(
      await this.jobModelRepository.findOneBy({
        knowledgeBaseId,
        documentId,
        documentIndexId,
        generation,
      }),
    )
  }

  async findByKnowledgeBaseIdAndDocumentIdAndGeneration(
    jobGenerationQO: DocumentIndexExecutionGenerationQueryObject,
  ): Promise<DocumentIndexExecutionRecordDto | null> {
    const { knowledgeBaseId, documentId, generation } = jobGenerationQO

    return JobRecordAdapter.toNullableRecord(
      await this.jobModelRepository.findOneBy({ knowledgeBaseId, documentId, generation }),
    )
  }

  async lockMembershipExecution(jobDocumentTargetQO: DocumentIndexExecutionMembershipQueryObject) {
    const { knowledgeBaseId, documentId } = jobDocumentTargetQO

    return JobRecordAdapter.toNullableRecord(
      await this.jobModelRepository.findOne({
        where: { knowledgeBaseId, documentId },
        lock: { mode: 'pessimistic_write' },
      }),
    )
  }

  async findMembershipExecution(jobDocumentTargetQO: DocumentIndexExecutionMembershipQueryObject) {
    const { knowledgeBaseId, documentId } = jobDocumentTargetQO

    return JobRecordAdapter.toNullableRecord(await this.jobModelRepository.findOneBy({ knowledgeBaseId, documentId }))
  }

  async enqueueRetry(createRetryJobQO: EnqueueDocumentIndexingRetryQueryObject) {
    return JobRecordAdapter.toRecord(await this.jobModelRepository.save(structuredClone(createRetryJobQO)))
  }

  async removeByKnowledgeBaseIdAndDocumentId(
    jobDocumentTargetQO: DocumentIndexExecutionMembershipQueryObject,
  ): Promise<void> {
    const { knowledgeBaseId, documentId } = jobDocumentTargetQO

    await this.jobModelRepository.delete({ knowledgeBaseId, documentId })
  }

  async findByDocumentIndexIdMany(jobsForIndexQO: DocumentIndexExecutionsForIndexQueryObject) {
    const { documentIndexId, lock } = jobsForIndexQO

    return JobRecordAdapter.toRecords(
      await this.jobModelRepository.find({
        where: { documentIndexId },
        ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      }),
    )
  }

  async deleteByIds(removeJobsQO: RemoveDocumentIndexExecutionsQueryObject): Promise<void> {
    if (!removeJobsQO.jobIds.length) return

    await this.jobModelRepository.delete({ id: In(removeJobsQO.jobIds) })
  }

  async findMembershipExecutions(jobsForTargetQO: DocumentIndexExecutionsForMembershipQueryObject) {
    const { knowledgeBaseId, documentId, lock } = jobsForTargetQO

    return JobRecordAdapter.toRecords(
      await this.jobModelRepository.find({
        where: { knowledgeBaseId, documentId },
        ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      }),
    )
  }

  async findByDocumentIndexId(jobIndexQO: DocumentIndexExecutionIndexQueryObject) {
    const { documentIndexId } = jobIndexQO

    return JobRecordAdapter.toNullableRecord(await this.jobModelRepository.findOneBy({ documentIndexId }))
  }

  async enqueue(saveQueuedJobQO: EnqueueDocumentIndexExecutionQueryObject): Promise<DocumentIndexExecutionRecordDto> {
    return JobRecordAdapter.toRecord(await this.jobModelRepository.save(structuredClone(saveQueuedJobQO)))
  }

  async releaseExecution(jobIdQO: DocumentIndexExecutionIdQueryObject): Promise<void> {
    const { jobId } = jobIdQO

    await this.jobModelRepository.delete({ id: jobId })
  }

  async lockExecution(jobIdQO: DocumentIndexExecutionIdQueryObject): Promise<DocumentIndexExecutionRecordDto | null> {
    const { jobId } = jobIdQO

    return JobRecordAdapter.toNullableRecord(
      await this.jobModelRepository.findOne({
        where: { id: jobId },
        lock: { mode: 'pessimistic_write' },
      }),
    )
  }

  async save(saveJobQO: SaveDocumentIndexExecutionQueryObject): Promise<DocumentIndexExecutionRecordDto> {
    return JobRecordAdapter.toRecord(await this.jobModelRepository.save(structuredClone(saveJobQO)))
  }

  async findExecutionInProject(
    jobInProjectQO: DocumentIndexExecutionInProjectQueryObject,
  ): Promise<DocumentIndexExecutionRecordDto | null> {
    const { projectId, id } = jobInProjectQO

    return JobRecordAdapter.toNullableRecord(
      await this.jobModelRepository.findOne({ where: { id, knowledgeBase: { projectId } } }),
    )
  }

  async renewLease(saveJobHeartbeatQO: RenewDocumentIndexExecutionLeaseQueryObject): Promise<void> {
    const { jobId } = saveJobHeartbeatQO

    await this.jobModelRepository.update(
      { id: jobId },
      JobWriteAdapter.toJobHeartbeatPersistence(
        saveJobHeartbeatQO.reservedAt,
        saveJobHeartbeatQO.leaseExpiresAt,
        saveJobHeartbeatQO.executionVerification,
      ),
    )
  }

  async countIndexExecutions(jobIndexQO: DocumentIndexExecutionIndexQueryObject): Promise<number> {
    const { documentIndexId } = jobIndexQO

    return this.jobModelRepository.countBy({ documentIndexId })
  }

  async rescheduleExecution(saveJobStatusQO: RescheduleDocumentIndexExecutionQueryObject): Promise<void> {
    const { jobId, ...statusFields } = saveJobStatusQO

    await this.jobModelRepository.update({ id: jobId }, JobWriteAdapter.toJobStatusPersistence(statusFields))
  }

  async countFailureRetries(jobRetrySourceQO: DocumentIndexExecutionRetrySourceQueryObject): Promise<number> {
    const { failedJobId } = jobRetrySourceQO

    return this.jobModelRepository.countBy({ retryOfFailedJobId: failedJobId })
  }

  async findExpiredExecutions(
    expiredJobsQO: ExpiredDocumentIndexExecutionsQueryObject,
  ): Promise<DocumentIndexExecutionRecordDto[]> {
    const { now } = expiredJobsQO

    return JobRecordAdapter.toRecords(
      await this.jobModelRepository.find({
        where: [
          { status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING, leaseExpiresAt: IsNull() },
          { status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING, leaseExpiresAt: LessThanOrEqual(now) },
        ],
        order: { documentId: 'ASC', knowledgeBaseId: 'ASC', id: 'ASC' },
      }),
    )
  }

  async lockExpiredExecution(
    expiredJobQO: ExpiredDocumentIndexExecutionQueryObject,
  ): Promise<DocumentIndexExecutionRecordDto | null> {
    const { jobId, now } = expiredJobQO

    return JobRecordAdapter.toNullableRecord(
      await this.jobModelRepository.findOne({
        where: [
          { id: jobId, status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING, leaseExpiresAt: IsNull() },
          { id: jobId, status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING, leaseExpiresAt: LessThanOrEqual(now) },
        ],
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      }),
    )
  }

  async countAvailableExecutions(queuedJobsQO: AvailableDocumentIndexExecutionsQueryObject): Promise<number> {
    const { availableAt } = queuedJobsQO

    return this.jobModelRepository.countBy({
      status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
      availableAt: LessThanOrEqual(availableAt),
    })
  }

  async findOldestAvailableExecution(
    queuedJobSnapshotQO: OldestAvailableDocumentIndexExecutionQueryObject,
  ): Promise<DocumentIndexExecutionRecordDto | null> {
    const { availableAt, excludedDocumentIndexIds } = queuedJobSnapshotQO

    const where: FindOptionsWhere<JobModel> = {
      status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
      availableAt: LessThanOrEqual(availableAt),
    }

    if (excludedDocumentIndexIds.length > 0) {
      where.documentIndexId = Not(In([...excludedDocumentIndexIds]))
    }

    return JobRecordAdapter.toNullableRecord(
      await this.jobModelRepository.findOne({ where, order: { createdAt: 'ASC', id: 'ASC' } }),
    )
  }

  async lockAvailableExecution(
    queuedJobQO: AvailableDocumentIndexExecutionQueryObject,
  ): Promise<DocumentIndexExecutionRecordDto | null> {
    const { jobId, availableAt } = queuedJobQO

    return JobRecordAdapter.toNullableRecord(
      await this.jobModelRepository.findOne({
        where: { id: jobId, status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED, availableAt: LessThanOrEqual(availableAt) },
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      }),
    )
  }

  async findSiblingExecutions(
    runningJobSiblingsQO: RunningDocumentIndexExecutionSiblingsQueryObject,
  ): Promise<DocumentIndexExecutionFactsDto[]> {
    const { documentIndexId, jobId } = runningJobSiblingsQO

    const executionFacts: DocumentIndexExecutionFactsDto[] = await this.jobModelRepository.find({
      where: { documentIndexId, status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING, id: Not(jobId) },
      select: { id: true, status: true, attempts: true, executionVerification: true },
    })

    return executionFacts.map((facts) => JobRecordAdapter.toExecutionFacts(facts))
  }

  async transitionExecution(updateJobStatusQO: TransitionDocumentIndexExecutionQueryObject): Promise<boolean> {
    const { jobId, expectedStatus, ...statusFields } = updateJobStatusQO

    const jobStatusUpdate = await this.jobModelRepository.update(
      { id: jobId, status: expectedStatus },
      JobWriteAdapter.toJobStatusPersistence(statusFields),
    )

    return (jobStatusUpdate.affected ?? 0) === 1
  }

  async releaseQueuedExecution(jobIdQO: DocumentIndexExecutionIdQueryObject): Promise<boolean> {
    const { jobId } = jobIdQO

    const queuedJobDeletion = await this.jobModelRepository.delete({
      id: jobId,
      status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
    })

    return (queuedJobDeletion.affected ?? 0) === 1
  }

  async releaseRunningExecution(jobIdQO: DocumentIndexExecutionIdQueryObject): Promise<void> {
    const { jobId } = jobIdQO

    await this.jobModelRepository.delete({ id: jobId, status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING })
  }
}
