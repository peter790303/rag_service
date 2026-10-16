import type { DocumentIndexExecutionVerificationDto } from '../DataTransferObjects/document-index-execution-verification.dto.ts'
import type { DocumentIndexExecutionStatus } from '../Helpers/document-index-execution-lifecycle.helper.ts'

export type DocumentIndexExecutionDocumentQueryObject = {
  readonly documentId: string
}

export type DocumentIndexExecutionTargetQueryObject = {
  readonly knowledgeBaseId: string
  readonly documentId: string
  readonly documentIndexId: string
  readonly generation: string
}

export type DocumentIndexExecutionGenerationQueryObject = {
  readonly knowledgeBaseId: string
  readonly documentId: string
  readonly generation: string
}

export type DocumentIndexExecutionMembershipQueryObject = {
  readonly knowledgeBaseId: string
  readonly documentId: string
}

export type DocumentIndexExecutionsForIndexQueryObject = {
  readonly documentIndexId: string
  readonly lock?: boolean
}

export type DocumentIndexExecutionsForMembershipQueryObject = {
  readonly knowledgeBaseId: string
  readonly documentId: string
  readonly lock?: boolean
}

export type DocumentIndexExecutionIndexQueryObject = {
  readonly documentIndexId: string
}

export type DocumentIndexExecutionIdQueryObject = {
  readonly jobId: string
}

export type DocumentIndexExecutionInProjectQueryObject = {
  readonly projectId: string
  readonly id: string
}

export type DocumentIndexExecutionRetrySourceQueryObject = {
  readonly failedJobId: string
}

export type ExpiredDocumentIndexExecutionsQueryObject = {
  readonly now: Date
}

export type ExpiredDocumentIndexExecutionQueryObject = {
  readonly jobId: string
  readonly now: Date
}

export type AvailableDocumentIndexExecutionsQueryObject = {
  readonly availableAt: Date
}

export type OldestAvailableDocumentIndexExecutionQueryObject = {
  readonly availableAt: Date
  readonly excludedDocumentIndexIds: readonly string[]
}

export type AvailableDocumentIndexExecutionQueryObject = {
  readonly jobId: string
  readonly availableAt: Date
}

export type RunningDocumentIndexExecutionSiblingsQueryObject = {
  readonly documentIndexId: string
  readonly jobId: string
}

interface NewDocumentIndexExecutionFields {
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

export type EnqueueDocumentIndexingRetryQueryObject = NewDocumentIndexExecutionFields

export type EnqueueDocumentIndexExecutionQueryObject = NewDocumentIndexExecutionFields

export interface SaveDocumentIndexExecutionQueryObject extends NewDocumentIndexExecutionFields {
  readonly id: string
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface RemoveDocumentIndexExecutionsQueryObject {
  readonly jobIds: readonly string[]
}

export interface DocumentIndexExecutionClaimFields {
  readonly status: 'running'
  readonly attempts: number
  readonly reservedAt: Date
  readonly leaseToken: string
  readonly leaseExpiresAt: Date
  readonly executionVerification: DocumentIndexExecutionVerificationDto
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

export interface RescheduleDocumentIndexExecutionQueryObject extends DocumentIndexExecutionRetryFields {
  readonly jobId: string
}

export type TransitionDocumentIndexExecutionQueryObject = DocumentIndexExecutionStatusFields & {
  readonly jobId: string
  readonly expectedStatus: DocumentIndexExecutionStatus
}

export interface RenewDocumentIndexExecutionLeaseQueryObject {
  readonly jobId: string
  readonly reservedAt: Date
  readonly leaseExpiresAt: Date
  readonly executionVerification: DocumentIndexExecutionVerificationDto
}
