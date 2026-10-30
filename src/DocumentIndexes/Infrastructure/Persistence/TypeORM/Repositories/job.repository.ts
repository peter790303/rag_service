import { Injectable } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { In, IsNull, LessThanOrEqual, Not, type FindOptionsWhere } from 'typeorm'

import { PersistenceTransaction } from '../../../../../Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import type { DocumentIndexExecutionFactsDTO } from '../../../../Application/DTOs/document-index-execution-facts.dto.ts'
import type { DocumentIndexExecutionRecordDTO } from '../../../../Application/DTOs/document-index-execution-record.dto.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../../Application/Helpers/document-index-execution-lifecycle.helper.ts'
import type {
  ExpiredDocumentIndexExecutionParams,
  ExpiredDocumentIndexExecutionsParams,
  TransitionDocumentIndexExecutionParams,
  AvailableDocumentIndexExecutionParams,
  OldestAvailableDocumentIndexExecutionParams,
  AvailableDocumentIndexExecutionsParams,
  RunningDocumentIndexExecutionSiblingsParams,
  EnqueueDocumentIndexingRetryParams,
  EnqueueDocumentIndexExecutionParams,
  UpdateDocumentIndexExecutionParams,
  RemoveDocumentIndexExecutionsParams,
  RenewDocumentIndexExecutionLeaseParams,
  RescheduleDocumentIndexExecutionParams,
} from '../../../../Application/Ports/Out/Gateways/document-index-execution.params.ts'
import type {
  DocumentIndexExecutionDocumentParams,
  DocumentIndexExecutionKnowledgeBaseDocumentParams,
  DocumentIndexExecutionGenerationParams,
  DocumentIndexExecutionIdParams,
  DocumentIndexExecutionInProjectParams,
  DocumentIndexExecutionIndexParams,
  DocumentIndexExecutionRetrySourceParams,
  DocumentIndexExecutionTargetParams,
  DocumentIndexExecutionsForIndexParams,
  DocumentIndexExecutionsForKnowledgeBaseDocumentParams,
} from '../../../../Application/Ports/Out/Gateways/document-index-execution.params.ts'
import { DocumentIndexExecutionQueue } from '../../../../Application/Ports/Out/Gateways/document-index-execution.queue.ts'
import { JobRecordAdapter } from '../Adapters/job-record.adapter.ts'
import { JobWriteAdapter } from '../Adapters/job-write.adapter.ts'
import { JobModel } from '../Models/job.model.ts'

/** Persists document-index deliveries and leases in the current transaction. */
@Injectable()
export class JobRepository extends DocumentIndexExecutionQueue {
  async countDocumentExecutions(jobDocumentQO: DocumentIndexExecutionDocumentParams): Promise<number> {
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
    jobTargetQO: DocumentIndexExecutionTargetParams,
  ): Promise<DocumentIndexExecutionRecordDTO | null> {
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
    jobGenerationQO: DocumentIndexExecutionGenerationParams,
  ): Promise<DocumentIndexExecutionRecordDTO | null> {
    const { knowledgeBaseId, documentId, generation } = jobGenerationQO

    return JobRecordAdapter.toNullableRecord(
      await this.jobModelRepository.findOneBy({ knowledgeBaseId, documentId, generation }),
    )
  }

  async lockKnowledgeBaseDocumentExecution(jobDocumentTargetQO: DocumentIndexExecutionKnowledgeBaseDocumentParams) {
    const { knowledgeBaseId, documentId } = jobDocumentTargetQO

    return JobRecordAdapter.toNullableRecord(
      await this.jobModelRepository.findOne({
        where: { knowledgeBaseId, documentId },
        lock: { mode: 'pessimistic_write' },
      }),
    )
  }

  async findKnowledgeBaseDocumentExecution(jobDocumentTargetQO: DocumentIndexExecutionKnowledgeBaseDocumentParams) {
    const { knowledgeBaseId, documentId } = jobDocumentTargetQO

    return JobRecordAdapter.toNullableRecord(await this.jobModelRepository.findOneBy({ knowledgeBaseId, documentId }))
  }

  async enqueueRetry(createRetryJobQO: EnqueueDocumentIndexingRetryParams): Promise<void> {
    await this.jobModelRepository.insert(JobWriteAdapter.toJobPersistence(createRetryJobQO))
  }

  async removeByKnowledgeBaseIdAndDocumentId(
    jobDocumentTargetQO: DocumentIndexExecutionKnowledgeBaseDocumentParams,
  ): Promise<void> {
    const { knowledgeBaseId, documentId } = jobDocumentTargetQO

    await this.jobModelRepository.delete({ knowledgeBaseId, documentId })
  }

  async findByDocumentIndexIdMany(jobsForIndexQO: DocumentIndexExecutionsForIndexParams) {
    const { documentIndexId, lock } = jobsForIndexQO

    return JobRecordAdapter.toRecords(
      await this.jobModelRepository.find({
        where: { documentIndexId },
        ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      }),
    )
  }

  async deleteByIds(removeJobsQO: RemoveDocumentIndexExecutionsParams): Promise<void> {
    if (!removeJobsQO.jobIds.length) return

    await this.jobModelRepository.delete({ id: In(removeJobsQO.jobIds) })
  }

  async findKnowledgeBaseDocumentExecutions(jobsForTargetQO: DocumentIndexExecutionsForKnowledgeBaseDocumentParams) {
    const { knowledgeBaseId, documentId, lock } = jobsForTargetQO

    return JobRecordAdapter.toRecords(
      await this.jobModelRepository.find({
        where: { knowledgeBaseId, documentId },
        ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      }),
    )
  }

  async findByDocumentIndexId(jobIndexQO: DocumentIndexExecutionIndexParams) {
    const { documentIndexId } = jobIndexQO

    return JobRecordAdapter.toNullableRecord(await this.jobModelRepository.findOneBy({ documentIndexId }))
  }

  async enqueue(saveQueuedJobQO: EnqueueDocumentIndexExecutionParams): Promise<void> {
    await this.jobModelRepository.insert(JobWriteAdapter.toJobPersistence(saveQueuedJobQO))
  }

  async releaseExecution(jobIdQO: DocumentIndexExecutionIdParams): Promise<void> {
    const { jobId } = jobIdQO

    await this.jobModelRepository.delete({ id: jobId })
  }

  async lockExecution(jobIdQO: DocumentIndexExecutionIdParams): Promise<DocumentIndexExecutionRecordDTO | null> {
    const { jobId } = jobIdQO

    return JobRecordAdapter.toNullableRecord(
      await this.jobModelRepository.findOne({
        where: { id: jobId },
        lock: { mode: 'pessimistic_write' },
      }),
    )
  }

  async update(updateJobQO: UpdateDocumentIndexExecutionParams): Promise<void> {
    await this.jobModelRepository.update({ id: updateJobQO.id }, JobWriteAdapter.toJobPersistence(updateJobQO))
  }

  async findExecutionInProject(
    jobInProjectQO: DocumentIndexExecutionInProjectParams,
  ): Promise<DocumentIndexExecutionRecordDTO | null> {
    const { projectId, id } = jobInProjectQO

    return JobRecordAdapter.toNullableRecord(
      await this.jobModelRepository.findOne({ where: { id, knowledgeBase: { projectId } } }),
    )
  }

  async renewLease(saveJobHeartbeatQO: RenewDocumentIndexExecutionLeaseParams): Promise<void> {
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

  async countIndexExecutions(jobIndexQO: DocumentIndexExecutionIndexParams): Promise<number> {
    const { documentIndexId } = jobIndexQO

    return this.jobModelRepository.countBy({ documentIndexId })
  }

  async rescheduleExecution(saveJobStatusQO: RescheduleDocumentIndexExecutionParams): Promise<void> {
    const { jobId, ...statusFields } = saveJobStatusQO

    await this.jobModelRepository.update({ id: jobId }, JobWriteAdapter.toJobStatusPersistence(statusFields))
  }

  async countFailureRetries(jobRetrySourceQO: DocumentIndexExecutionRetrySourceParams): Promise<number> {
    const { failedJobId } = jobRetrySourceQO

    return this.jobModelRepository.countBy({ retryOfFailedJobId: failedJobId })
  }

  async findExpiredExecutions(
    expiredJobsQO: ExpiredDocumentIndexExecutionsParams,
  ): Promise<DocumentIndexExecutionRecordDTO[]> {
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
    expiredJobQO: ExpiredDocumentIndexExecutionParams,
  ): Promise<DocumentIndexExecutionRecordDTO | null> {
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

  async countAvailableExecutions(queuedJobsQO: AvailableDocumentIndexExecutionsParams): Promise<number> {
    const { availableAt } = queuedJobsQO

    return this.jobModelRepository.countBy({
      status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
      availableAt: LessThanOrEqual(availableAt),
    })
  }

  async findOldestAvailableExecution(
    queuedJobSnapshotQO: OldestAvailableDocumentIndexExecutionParams,
  ): Promise<DocumentIndexExecutionRecordDTO | null> {
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
    queuedJobQO: AvailableDocumentIndexExecutionParams,
  ): Promise<DocumentIndexExecutionRecordDTO | null> {
    const { jobId, availableAt } = queuedJobQO

    return JobRecordAdapter.toNullableRecord(
      await this.jobModelRepository.findOne({
        where: { id: jobId, status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED, availableAt: LessThanOrEqual(availableAt) },
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      }),
    )
  }

  async findSiblingExecutions(
    runningJobSiblingsQO: RunningDocumentIndexExecutionSiblingsParams,
  ): Promise<DocumentIndexExecutionFactsDTO[]> {
    const { documentIndexId, jobId } = runningJobSiblingsQO

    const executionFacts: Pick<JobModel, keyof DocumentIndexExecutionFactsDTO>[] = await this.jobModelRepository.find({
      where: { documentIndexId, status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING, id: Not(jobId) },
      select: { id: true, status: true, attempts: true, executionVerification: true },
    })

    return executionFacts.map((executionFact) => JobRecordAdapter.toExecutionFacts(executionFact))
  }

  async transitionExecution(updateJobStatusQO: TransitionDocumentIndexExecutionParams): Promise<boolean> {
    const { jobId, expectedStatus, ...statusFields } = updateJobStatusQO

    const jobStatusUpdate = await this.jobModelRepository.update(
      { id: jobId, status: expectedStatus },
      JobWriteAdapter.toJobStatusPersistence(statusFields),
    )

    return (jobStatusUpdate.affected ?? 0) === 1
  }

  async releaseQueuedExecution(jobIdQO: DocumentIndexExecutionIdParams): Promise<boolean> {
    const { jobId } = jobIdQO

    const queuedJobDeletion = await this.jobModelRepository.delete({
      id: jobId,
      status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
    })

    return (queuedJobDeletion.affected ?? 0) === 1
  }

  async releaseRunningExecution(jobIdQO: DocumentIndexExecutionIdParams): Promise<void> {
    const { jobId } = jobIdQO

    await this.jobModelRepository.delete({ id: jobId, status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING })
  }
}
