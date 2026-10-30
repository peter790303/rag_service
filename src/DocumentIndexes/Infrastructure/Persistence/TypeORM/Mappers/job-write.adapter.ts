import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.d.ts'

import { JobExecutionVerificationAdapter } from './job-execution-verification.adapter.ts'
import type { DocumentIndexExecutionVerificationDTO } from '../../../../Application/DataTransferObjects/document-index-execution-verification.dto.ts'
import type {
  EnqueueDocumentIndexExecutionParams,
  EnqueueDocumentIndexingRetryParams,
  UpdateDocumentIndexExecutionParams,
} from '../../../../Application/Ports/Out/Gateways/document-index-execution.params.ts'
import type { DocumentIndexExecutionStatusFields } from '../../../../Application/Ports/Out/Gateways/document-index-execution.params.ts'
import type { JobModel } from '../Models/job.model.ts'

/** Converts an explicit status write to the job Model's stored column values. */
export class JobWriteAdapter {
  static toJobPersistence(
    execution:
      EnqueueDocumentIndexExecutionParams | EnqueueDocumentIndexingRetryParams | UpdateDocumentIndexExecutionParams,
  ): QueryDeepPartialEntity<JobModel> {
    // JSON evidence is a validated opaque value, replaced as a whole by TypeORM.
    return structuredClone(execution) as QueryDeepPartialEntity<JobModel>
  }

  static toJobStatusPersistence(jobStatusWrite: DocumentIndexExecutionStatusFields): QueryDeepPartialEntity<JobModel> {
    const jobStatusPersistenceAttributes = {
      ...jobStatusWrite,
      executionVerification:
        jobStatusWrite.executionVerification === null
          ? null
          : JobExecutionVerificationAdapter.toJobExecutionVerificationPersistence(jobStatusWrite.executionVerification),
    }

    // TypeORM treats opaque JSON columns as recursively partial objects; these writes replace the whole JSON value.
    return jobStatusPersistenceAttributes as QueryDeepPartialEntity<JobModel>
  }

  static toJobHeartbeatPersistence(
    reservedAt: Date,
    leaseExpiresAt: Date,
    jobExecutionVerification: DocumentIndexExecutionVerificationDTO,
  ): QueryDeepPartialEntity<JobModel> {
    const storedExecutionVerification =
      JobExecutionVerificationAdapter.toJobExecutionVerificationPersistence(jobExecutionVerification)
    const jobHeartbeatPersistenceAttributes = {
      reservedAt,
      leaseExpiresAt,
      executionVerification: storedExecutionVerification,
    }

    return jobHeartbeatPersistenceAttributes as QueryDeepPartialEntity<JobModel>
  }
}
