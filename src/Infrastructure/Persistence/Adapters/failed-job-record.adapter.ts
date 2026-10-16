import type { DocumentIndexFailureRecordDto } from '../../../Application/DocumentIndexes/DataTransferObjects/document-index-failure-record.dto.ts'
import type { FailedJobModel } from '../Models/failed-job.model.ts'

/** Copies only persisted technical-record fields; never exposes ORM models or mutable references. */
export class FailedJobRecordAdapter {
  static toRecord(model: Pick<FailedJobModel, keyof DocumentIndexFailureRecordDto>): DocumentIndexFailureRecordDto {
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

  static toNullableRecord(model: FailedJobModel | null): DocumentIndexFailureRecordDto | null {
    return model === null ? null : this.toRecord(model)
  }

  static toRecords(models: readonly FailedJobModel[]): DocumentIndexFailureRecordDto[] {
    return models.map((model) => this.toRecord(model))
  }
}
