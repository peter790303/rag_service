import type { DocumentIndexExecutionVerificationDTO } from '../../../../Application/DataTransferObjects/document-index-execution-verification.dto.ts'

/** Converts the lease fields to the stored JSON column names. */
export class JobExecutionVerificationAdapter {
  static toJobExecutionVerificationPersistence(
    jobExecutionVerification: DocumentIndexExecutionVerificationDTO,
  ): Record<string, unknown> {
    const storedJobExecutionVerification: Record<string, unknown> = {
      stage: jobExecutionVerification.stage,
      completedUnits: jobExecutionVerification.completedUnits,
      totalUnits: jobExecutionVerification.totalUnits,
      verifiedAt: jobExecutionVerification.verifiedAt,
    }

    if (jobExecutionVerification.claimToken !== undefined)
      storedJobExecutionVerification.claim_token = jobExecutionVerification.claimToken

    if (jobExecutionVerification.leaseExpiresAt !== undefined)
      storedJobExecutionVerification.lease_expires_at = jobExecutionVerification.leaseExpiresAt

    return storedJobExecutionVerification
  }
}
