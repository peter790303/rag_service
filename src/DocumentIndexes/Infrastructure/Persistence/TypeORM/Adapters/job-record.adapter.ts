import type { DocumentIndexExecutionFactsDTO } from '../../../../Application/DTOs/document-index-execution-facts.dto.ts'
import type { DocumentIndexExecutionRecordDTO } from '../../../../Application/DTOs/document-index-execution-record.dto.ts'
import type { JobModel } from '../Models/job.model.ts'

/** Copies only persisted technical-record fields; never exposes ORM models or mutable references. */
export class JobRecordAdapter {
  static toExecutionFacts(model: Pick<JobModel, keyof DocumentIndexExecutionFactsDTO>): DocumentIndexExecutionFactsDTO {
    return {
      id: model.id,
      status: model.status,
      attempts: model.attempts,
      executionVerification: structuredClone(model.executionVerification),
    }
  }

  static toRecord(model: Pick<JobModel, keyof DocumentIndexExecutionRecordDTO>): DocumentIndexExecutionRecordDTO {
    return {
      id: model.id,
      knowledgeBaseId: model.knowledgeBaseId,
      documentId: model.documentId,
      documentIndexId: model.documentIndexId,
      generation: model.generation,
      status: model.status,
      attempts: model.attempts,
      availableAt: new Date(model.availableAt.getTime()),
      reservedAt: model.reservedAt === null ? null : new Date(model.reservedAt.getTime()),
      leaseToken: model.leaseToken,
      leaseExpiresAt: model.leaseExpiresAt === null ? null : new Date(model.leaseExpiresAt.getTime()),
      idempotencyKey: model.idempotencyKey,
      retryOfFailedJobId: model.retryOfFailedJobId,
      payload: structuredClone(model.payload),
      executionState: structuredClone(model.executionState),
      executionVerification: structuredClone(model.executionVerification),
      createdAt: new Date(model.createdAt.getTime()),
      updatedAt: new Date(model.updatedAt.getTime()),
    }
  }

  static toNullableRecord(model: JobModel | null): DocumentIndexExecutionRecordDTO | null {
    return model === null ? null : this.toRecord(model)
  }

  static toRecords(models: readonly JobModel[]): DocumentIndexExecutionRecordDTO[] {
    return models.map((model) => this.toRecord(model))
  }
}
