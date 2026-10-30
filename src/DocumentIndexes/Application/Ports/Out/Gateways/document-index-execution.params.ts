import type { DocumentIndexExecutionVerificationDTO } from '../../../DataTransferObjects/document-index-execution-verification.dto.ts'
import type { DocumentIndexExecutionStatus } from '../../../Helpers/document-index-execution-lifecycle.helper.ts'

export type DocumentIndexExecutionDocumentParams = {
  readonly documentId: string
}

export type DocumentIndexExecutionTargetParams = {
  readonly knowledgeBaseId: string
  readonly documentId: string
  readonly documentIndexId: string
  readonly generation: string
}

export type DocumentIndexExecutionGenerationParams = {
  readonly knowledgeBaseId: string
  readonly documentId: string
  readonly generation: string
}

export type DocumentIndexExecutionKnowledgeBaseDocumentParams = {
  readonly knowledgeBaseId: string
  readonly documentId: string
}

export type DocumentIndexExecutionsForIndexParams = {
  readonly documentIndexId: string
  readonly lock?: boolean
}

export type DocumentIndexExecutionsForKnowledgeBaseDocumentParams = {
  readonly knowledgeBaseId: string
  readonly documentId: string
  readonly lock?: boolean
}

export type DocumentIndexExecutionIndexParams = {
  readonly documentIndexId: string
}

export type DocumentIndexExecutionIdParams = {
  readonly jobId: string
}

export type DocumentIndexExecutionInProjectParams = {
  readonly projectId: string
  readonly id: string
}

export type DocumentIndexExecutionRetrySourceParams = {
  readonly failedJobId: string
}

export type ExpiredDocumentIndexExecutionsParams = {
  readonly now: Date
}

export type ExpiredDocumentIndexExecutionParams = {
  readonly jobId: string
  readonly now: Date
}

export type AvailableDocumentIndexExecutionsParams = {
  readonly availableAt: Date
}

export type OldestAvailableDocumentIndexExecutionParams = {
  readonly availableAt: Date
  readonly excludedDocumentIndexIds: readonly string[]
}

export type AvailableDocumentIndexExecutionParams = {
  readonly jobId: string
  readonly availableAt: Date
}

export type RunningDocumentIndexExecutionSiblingsParams = {
  readonly documentIndexId: string
  readonly jobId: string
}

interface NewDocumentIndexExecutionFields {
  readonly id: string
  readonly knowledgeBaseId: string
  readonly documentId: string
  readonly documentIndexId: string
  readonly generation: string
  readonly status: DocumentIndexExecutionStatus
  readonly attempts: number
  readonly availableAt: Date
  readonly reservedAt: Date | null
  readonly leaseToken: string | null
  readonly leaseExpiresAt: Date | null
  readonly idempotencyKey: string | null
  readonly retryOfFailedJobId: string | null
  readonly payload: Record<string, unknown>
  readonly executionState: Record<string, unknown> | null
  readonly executionVerification: Record<string, unknown> | null
}

export type EnqueueDocumentIndexingRetryParams = NewDocumentIndexExecutionFields

export type EnqueueDocumentIndexExecutionParams = NewDocumentIndexExecutionFields

export interface UpdateDocumentIndexExecutionParams extends NewDocumentIndexExecutionFields {
  readonly id: string
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface RemoveDocumentIndexExecutionsParams {
  readonly jobIds: readonly string[]
}

export interface DocumentIndexExecutionClaimFields {
  readonly status: 'running'
  readonly attempts: number
  readonly reservedAt: Date
  readonly leaseToken: string
  readonly leaseExpiresAt: Date
  readonly executionVerification: DocumentIndexExecutionVerificationDTO
}

export interface DocumentIndexExecutionRetryFields {
  readonly status: 'queued'
  readonly availableAt: Date
  readonly reservedAt: null
  readonly leaseToken: null
  readonly leaseExpiresAt: null
  readonly executionVerification: null
  readonly executionState: Record<string, unknown> | null
}

export type DocumentIndexExecutionStatusFields = DocumentIndexExecutionClaimFields | DocumentIndexExecutionRetryFields

export interface RescheduleDocumentIndexExecutionParams extends DocumentIndexExecutionRetryFields {
  readonly jobId: string
}

export type TransitionDocumentIndexExecutionParams = DocumentIndexExecutionStatusFields & {
  readonly jobId: string
  readonly expectedStatus: DocumentIndexExecutionStatus
}

export interface RenewDocumentIndexExecutionLeaseParams {
  readonly jobId: string
  readonly reservedAt: Date
  readonly leaseExpiresAt: Date
  readonly executionVerification: DocumentIndexExecutionVerificationDTO
}
