import type { DocumentIndexExecutionLeaseDTO } from '../DataTransferObjects/document-index-execution-lease.dto.ts'
import type { DocumentIndexExecutionRecordDTO } from '../DataTransferObjects/document-index-execution-record.dto.ts'

/** Restores domain facts from whitelisted persisted fields without performing I/O. */
export class ReadLeaseDocumentIndexesAssembler {
  static toDocumentIndexExecutionLease(jobRecord: DocumentIndexExecutionRecordDTO): DocumentIndexExecutionLeaseDTO {
    const rawLeaseToken = jobRecord.executionVerification?.claim_token
    const leaseToken = typeof rawLeaseToken === 'string' ? rawLeaseToken : null
    const leaseExpiresAt = this.toLeaseExpiresAt(jobRecord)

    return {
      id: jobRecord.id,
      knowledgeBaseId: jobRecord.knowledgeBaseId,
      documentId: jobRecord.documentId,
      documentIndexId: jobRecord.documentIndexId,
      generation: jobRecord.generation,
      attempts: jobRecord.attempts,
      status: jobRecord.status,
      leaseToken,
      leaseExpiresAt,
    }
  }

  static toLeaseExpiresAt(jobRecord: Pick<DocumentIndexExecutionRecordDTO, 'executionVerification'>): Date | null {
    const rawLeaseExpiry = jobRecord.executionVerification?.lease_expires_at
    const parsedLeaseExpiry = typeof rawLeaseExpiry === 'string' ? new Date(rawLeaseExpiry) : null
    const leaseExpiresAt =
      parsedLeaseExpiry !== null && Number.isFinite(parsedLeaseExpiry.getTime()) ? parsedLeaseExpiry : null

    return leaseExpiresAt
  }
}
