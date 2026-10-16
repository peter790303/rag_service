import { DocumentIndexExecutionStageEnum } from '../Enums/document-index-execution-stage.enum.ts'

export type DocumentIndexExecutionVerificationDto = {
  readonly stage: DocumentIndexExecutionStageEnum
  readonly completedUnits: number
  readonly totalUnits: number | null
  readonly verifiedAt: string | null
  readonly claimToken?: string | null
  readonly leaseExpiresAt?: string | null
}
