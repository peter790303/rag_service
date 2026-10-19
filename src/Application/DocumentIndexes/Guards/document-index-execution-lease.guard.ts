import type { DocumentIndexExecutionLeaseDTO } from '../DataTransferObjects/document-index-execution-lease.dto.ts'
import type { DocumentIndexingDeliveryDTO } from '../DataTransferObjects/document-indexing-delivery.dto.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../Exceptions/invalid-document-index-execution-lease.exception.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../Helpers/document-index-execution-lifecycle.helper.ts'

/** Validates the worker's claim against the record held by the application transaction. */
export class DocumentIndexExecutionLeaseGuard {
  static assertCurrentClaim(
    claim: DocumentIndexingDeliveryDTO,
    record: DocumentIndexExecutionLeaseDTO | null,
    now: Date,
  ): asserts record is DocumentIndexExecutionLeaseDTO {
    if (!record) throw new InvalidDocumentIndexExecutionLeaseException()

    if (
      record.id !== claim.id ||
      record.knowledgeBaseId !== claim.knowledgeBaseId ||
      record.documentId !== claim.documentId ||
      record.documentIndexId !== claim.documentIndexId ||
      record.generation !== claim.generation ||
      record.attempts !== claim.attempts ||
      record.status !== DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING ||
      record.leaseToken !== claim.leaseToken ||
      record.leaseExpiresAt === null ||
      !Number.isFinite(record.leaseExpiresAt.getTime()) ||
      !Number.isFinite(now.getTime()) ||
      record.leaseExpiresAt.getTime() <= now.getTime()
    ) {
      throw new InvalidDocumentIndexExecutionLeaseException()
    }
  }
}
