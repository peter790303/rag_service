import { ReadLeaseDocumentIndexesAssembler } from './read-lease-document-indexes.assembler.ts'
import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import type { DocumentIndexExecutionFactsDTO } from '../DataTransferObjects/document-index-execution-facts.dto.ts'
import type { DocumentIndexExecutionRecordDTO } from '../DataTransferObjects/document-index-execution-record.dto.ts'
import type { DocumentIndexExecutionVerificationDTO } from '../DataTransferObjects/document-index-execution-verification.dto.ts'
import type {
  DocumentIndexingClaimCandidateDTO,
  DocumentIndexingClaimExecutionDTO,
  DocumentIndexingClaimKnowledgeBaseDocumentDTO,
  DocumentIndexExecutionSiblingLeaseDTO,
} from '../DataTransferObjects/document-indexing-claim-candidate.dto.ts'
import type { DocumentIndexingClaimDTO } from '../DataTransferObjects/document-indexing-claim.dto.ts'
import type { DocumentIndexingLeaseClaimDTO } from '../DataTransferObjects/document-indexing-lease-claim.dto.ts'
import { DocumentIndexExecutionStageEnum } from '../Enums/document-index-execution-stage.enum.ts'
import type { DocumentIndexExecutionClaimFields } from '../QueryObjects/document-index-execution.query-object.ts'

/** Maps queued-job candidates, their new leases, and the claimed worker result. */
export class WriteClaimDocumentIndexesAssembler {
  static toDocumentIndexingClaimExecution(
    jobRecord: DocumentIndexExecutionRecordDTO,
  ): DocumentIndexingClaimExecutionDTO {
    return {
      id: jobRecord.id,
      knowledgeBaseId: jobRecord.knowledgeBaseId,
      documentId: jobRecord.documentId,
      documentIndexId: jobRecord.documentIndexId,
      generation: jobRecord.generation,
      attempts: jobRecord.attempts,
    }
  }

  static toDocumentIndexExecutionSiblingLease(
    jobRecord: DocumentIndexExecutionFactsDTO,
  ): DocumentIndexExecutionSiblingLeaseDTO {
    const leaseExpiresAt = ReadLeaseDocumentIndexesAssembler.toLeaseExpiresAt(jobRecord)

    return { id: jobRecord.id, attempts: jobRecord.attempts, leaseExpiresAt }
  }

  static toDocumentIndexingClaimCandidate(
    claimJob: DocumentIndexingClaimExecutionDTO,
    documentIndex: DocumentIndex | null,
    previousDocumentIndex: DocumentIndex | null,
    claimKnowledgeBaseDocument: DocumentIndexingClaimKnowledgeBaseDocumentDTO | null,
    runningSiblingLeases: readonly DocumentIndexExecutionSiblingLeaseDTO[],
  ): DocumentIndexingClaimCandidateDTO {
    return {
      job: claimJob,
      documentIndex,
      previousDocumentIndex,
      knowledgeBaseDocument: claimKnowledgeBaseDocument,
      runningSiblingLeases,
    }
  }

  static toDocumentIndexingLeaseClaim(
    attempts: number,
    leaseToken: string,
    leaseExpiresAt: Date,
    claimedAt: Date,
  ): DocumentIndexingLeaseClaimDTO {
    const executionVerification = this.toDocumentIndexExecutionClaimVerification(leaseToken, leaseExpiresAt, claimedAt)

    return { attempts, leaseToken, leaseExpiresAt, executionVerification }
  }

  static toDocumentIndexExecutionClaimWrite(
    status: 'running',
    reservedAt: Date,
    jobClaim: DocumentIndexingLeaseClaimDTO,
  ): DocumentIndexExecutionClaimFields {
    return {
      status,
      attempts: jobClaim.attempts,
      reservedAt,
      leaseToken: jobClaim.leaseToken,
      leaseExpiresAt: jobClaim.leaseExpiresAt,
      executionVerification: jobClaim.executionVerification,
    }
  }

  static toDocumentIndexingClaim(
    claimJob: DocumentIndexingClaimExecutionDTO,
    jobClaim: DocumentIndexingLeaseClaimDTO,
  ): DocumentIndexingClaimDTO {
    const executionVerification = this.toDocumentIndexExecutionVerification(jobClaim.executionVerification)

    return {
      id: claimJob.id,
      knowledgeBaseId: claimJob.knowledgeBaseId,
      documentId: claimJob.documentId,
      documentIndexId: claimJob.documentIndexId,
      generation: claimJob.generation,
      attempts: jobClaim.attempts,
      leaseToken: jobClaim.leaseToken,
      leaseExpiresAt: jobClaim.leaseExpiresAt,
      executionVerification,
    }
  }

  private static toDocumentIndexExecutionClaimVerification(
    leaseToken: string,
    leaseExpiresAt: Date,
    claimedAt: Date,
  ): DocumentIndexExecutionVerificationDTO {
    return {
      stage: DocumentIndexExecutionStageEnum.CLAIMED,
      completedUnits: 0,
      totalUnits: null,
      verifiedAt: claimedAt.toISOString(),
      claimToken: leaseToken,
      leaseExpiresAt: leaseExpiresAt.toISOString(),
    }
  }

  private static toDocumentIndexExecutionVerification(
    executionVerification: DocumentIndexExecutionVerificationDTO,
  ): DocumentIndexExecutionVerificationDTO {
    return {
      stage: executionVerification.stage,
      completedUnits: executionVerification.completedUnits,
      totalUnits: executionVerification.totalUnits,
      verifiedAt: executionVerification.verifiedAt,
      ...(executionVerification.claimToken !== undefined ? { claimToken: executionVerification.claimToken } : {}),
      ...(executionVerification.leaseExpiresAt !== undefined
        ? { leaseExpiresAt: executionVerification.leaseExpiresAt }
        : {}),
    }
  }
}
