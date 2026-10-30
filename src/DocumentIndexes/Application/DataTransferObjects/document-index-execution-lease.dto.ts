import type { DocumentIndexExecutionStatus } from '../Helpers/document-index-execution-lifecycle.helper.ts'

export type DocumentIndexExecutionLeaseDTO = {
  id: string
  knowledgeBaseId: string
  documentId: string
  documentIndexId: string
  generation: string
  attempts: number
  status: DocumentIndexExecutionStatus
  leaseToken: string | null
  leaseExpiresAt: Date | null
}
