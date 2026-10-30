import type { DocumentIndexExecutionStatus } from '../Helpers/document-index-execution-lifecycle.helper.ts'

/** Persisted execution columns selected when inspecting running siblings. */
export interface DocumentIndexExecutionFactsDTO {
  readonly id: string
  readonly status: DocumentIndexExecutionStatus
  readonly attempts: number
  readonly executionVerification: Record<string, unknown> | null
}
