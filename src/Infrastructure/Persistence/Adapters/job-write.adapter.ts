import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.d.ts'

import { JobExecutionVerificationAdapter } from './job-execution-verification.adapter.ts'
import type { DocumentIndexExecutionVerificationDto } from '../../../Application/DocumentIndexes/DataTransferObjects/document-index-execution-verification.dto.ts'
import type { DocumentIndexExecutionStatusFields } from '../../../Application/DocumentIndexes/QueryObjects/document-index-execution.query-object.ts'
import type { JobModel } from '../Models/job.model.ts'

/** Converts an explicit status write to the job Model's stored column values. */
export class JobWriteAdapter {
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
    jobExecutionVerification: DocumentIndexExecutionVerificationDto,
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
