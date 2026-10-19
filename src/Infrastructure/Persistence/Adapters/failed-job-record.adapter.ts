import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js'

import type { DocumentIndexFailureRecordDTO } from '../../../Application/DocumentIndexes/DataTransferObjects/document-index-failure-record.dto.ts'
import type { ArchiveDocumentIndexFailureQueryObject } from '../../../Application/DocumentIndexes/QueryObjects/document-index-failure.query-object.ts'
import type { FailedJobModel } from '../Models/failed-job.model.ts'

/** Copies only persisted technical-record fields; never exposes ORM models or mutable references. */
export class FailedJobRecordAdapter {
  static toPersistence(failure: ArchiveDocumentIndexFailureQueryObject): QueryDeepPartialEntity<FailedJobModel> {
    // JSON retry payload and reasons are validated opaque values.
    return structuredClone(failure) as QueryDeepPartialEntity<FailedJobModel>
  }

  static toPersistenceRecords(
    failures: readonly ArchiveDocumentIndexFailureQueryObject[],
  ): QueryDeepPartialEntity<FailedJobModel>[] {
    return failures.map(FailedJobRecordAdapter.toPersistence)
  }

  static toRecord(model: Pick<FailedJobModel, keyof DocumentIndexFailureRecordDTO>): DocumentIndexFailureRecordDTO {
    return {
      id: model.id,
      jobId: model.jobId,
      knowledgeBaseId: model.knowledgeBaseId,
      documentId: model.documentId,
      documentIndexId: model.documentIndexId,
      generation: model.generation,
      attempts: model.attempts,
      errorCode: model.errorCode,
      errorMessage: model.errorMessage,
      blockedReasons: structuredClone(model.blockedReasons),
      retryPayload: structuredClone(model.retryPayload),
      failedAt: new Date(model.failedAt.getTime()),
      retriedAt: model.retriedAt === null ? null : new Date(model.retriedAt.getTime()),
      createdAt: new Date(model.createdAt.getTime()),
      updatedAt: new Date(model.updatedAt.getTime()),
    }
  }

  static toNullableRecord(model: FailedJobModel | null): DocumentIndexFailureRecordDTO | null {
    return model === null ? null : this.toRecord(model)
  }

  static toRecords(models: readonly FailedJobModel[]): DocumentIndexFailureRecordDTO[] {
    return models.map((model) => this.toRecord(model))
  }
}
