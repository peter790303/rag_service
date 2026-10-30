import type { DocumentIndexingDeliveryDTO } from '../DTOs/document-indexing-delivery.dto.ts'
import type { DocumentIndexingFailureDecision } from '../DTOs/document-indexing-failure-decision.dto.ts'
import { InvalidDocumentIndexingFailureDecisionException } from '../Exceptions/invalid-document-indexing-failure-decision.exception.ts'

/** Document indexing failed under this claim, with its failure time and retry outcome recorded. */
export class DocumentIndexingFailedEvent {
  readonly jobDelivery: DocumentIndexingDeliveryDTO

  readonly failureDecision: DocumentIndexingFailureDecision

  constructor({
    jobDelivery,
    failureDecision,
  }: {
    readonly jobDelivery: DocumentIndexingDeliveryDTO
    readonly failureDecision: DocumentIndexingFailureDecision
  }) {
    if (typeof failureDecision.errorCode !== 'string' || !failureDecision.errorCode.trim()) {
      throw new InvalidDocumentIndexingFailureDecisionException({ field: 'errorCode' })
    }

    if (typeof failureDecision.errorMessage !== 'string') {
      throw new InvalidDocumentIndexingFailureDecisionException({ field: 'errorMessage' })
    }

    if (!(failureDecision.failedAt instanceof Date) || !Number.isFinite(failureDecision.failedAt.getTime())) {
      throw new InvalidDocumentIndexingFailureDecisionException({ field: 'failedAt' })
    }

    if (
      failureDecision.retryAt !== null &&
      (!(failureDecision.retryAt instanceof Date) || !Number.isFinite(failureDecision.retryAt.getTime()))
    ) {
      throw new InvalidDocumentIndexingFailureDecisionException({ field: 'retryAt' })
    }

    this.jobDelivery = {
      ...jobDelivery,
      leaseExpiresAt: new Date(jobDelivery.leaseExpiresAt),
    }
    this.failureDecision = {
      ...failureDecision,
      failedAt: new Date(failureDecision.failedAt),
      retryAt: failureDecision.retryAt === null ? null : new Date(failureDecision.retryAt),
    }
  }
}
