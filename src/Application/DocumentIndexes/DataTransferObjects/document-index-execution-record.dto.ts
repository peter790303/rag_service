import type { DocumentIndexExecutionStatus } from '../Helpers/document-index-execution-lifecycle.helper.ts'

export type DocumentIndexExecutionRecordDto = {
  id: string
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
  generation: string
  status: DocumentIndexExecutionStatus
  attempts: number
  availableAt: Date
  reservedAt: Date | null
  leaseToken: string | null
  leaseExpiresAt: Date | null
  idempotencyKey: string | null
  retryOfFailedJobId: string | null
  payload: Record<string, unknown>
  executionState: Record<string, unknown> | null
  executionVerification: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}
