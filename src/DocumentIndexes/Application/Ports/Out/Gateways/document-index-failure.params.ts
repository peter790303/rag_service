export type DocumentIndexFailureInProjectParams = {
  readonly idOrJobId: string
  readonly projectId: string
}

export type DocumentIndexFailureIdParams = {
  readonly failedJobId: string
}

export type UnretriedDocumentIndexFailureTargetParams = {
  readonly knowledgeBaseId: string
  readonly documentId: string
  readonly documentIndexId: string
  readonly generation: string
}

export type DocumentIndexFailureKnowledgeBaseDocumentParams = {
  readonly knowledgeBaseId: string
  readonly documentId: string
}

export type DocumentIndexFailureIndexParams = {
  readonly documentIndexId: string
}

export type DocumentIndexFailureLookupParams = {
  readonly id: string
}

export type UnretriedDocumentIndexFailuresParams = {
  readonly cutoff: Date
  readonly failedJobId?: string
  readonly projectId?: string
}

export type DocumentIndexFailureDocumentParams = {
  readonly documentId: string
}

export type ExpiredDocumentIndexFailuresParams = {
  readonly cutoff: Date
}

interface NewDocumentIndexFailureFields {
  readonly jobId: string
  readonly knowledgeBaseId: string
  readonly documentId: string
  readonly documentIndexId: string
  readonly generation: string
  readonly attempts: number
  readonly errorCode: string | null
  readonly errorMessage: string | null
  readonly blockedReasons: unknown[]
  readonly retryPayload: Record<string, unknown>
  readonly failedAt: Date
  readonly retriedAt: Date | null
}

export interface ArchiveDocumentIndexFailureParams extends NewDocumentIndexFailureFields {
  readonly id?: string
  readonly createdAt?: Date
  readonly updatedAt?: Date
}

export interface ArchiveDocumentIndexFailuresParams {
  readonly failedJobs: readonly ArchiveDocumentIndexFailureParams[]
}

export interface RemoveDocumentIndexFailuresParams {
  readonly failedJobIds: readonly string[]
}
