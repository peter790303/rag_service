import type { ExpiredDocumentIndexFailureDto } from '../../../Application/DocumentIndexes/DataTransferObjects/expired-document-index-failure.dto.ts'
import type { FailedJobModel } from '../Models/failed-job.model.ts'

type FailedJobRetentionProjection = Pick<FailedJobModel, 'id' | 'documentId' | 'failedAt'>

/** Projects the failed-job columns required by the retention port. */
export class FailedJobRetentionFactsAdapter {
  static toGarbageFailedJobCandidate(failedJobModel: FailedJobRetentionProjection): ExpiredDocumentIndexFailureDto {
    return {
      failedJobId: failedJobModel.id,
      documentId: failedJobModel.documentId,
      failedAt: new Date(failedJobModel.failedAt.getTime()),
    }
  }

  static toGarbageFailedJobCandidates(
    failedJobModels: readonly FailedJobRetentionProjection[],
  ): ExpiredDocumentIndexFailureDto[] {
    return failedJobModels.map((failedJobModel) => this.toGarbageFailedJobCandidate(failedJobModel))
  }

  static toNullableGarbageFailedJobCandidate(
    failedJobModel: FailedJobRetentionProjection | null,
  ): ExpiredDocumentIndexFailureDto | null {
    if (failedJobModel === null) return null

    return this.toGarbageFailedJobCandidate(failedJobModel)
  }
}
