export type DocumentIndexFailureInProjectQueryObject = {
  readonly idOrJobId: string
  readonly projectId: string
}

export type DocumentIndexFailureIdQueryObject = {
  readonly failedJobId: string
}

export type UnretriedDocumentIndexFailureTargetQueryObject = {
  readonly knowledgeBaseId: string
  readonly documentId: string
  readonly documentIndexId: string
  readonly generation: string
}

export type DocumentIndexFailureKnowledgeBaseDocumentQueryObject = {
  readonly knowledgeBaseId: string
  readonly documentId: string
}

export type DocumentIndexFailureIndexQueryObject = {
  readonly documentIndexId: string
}

export type DocumentIndexFailureLookupQueryObject = {
  readonly id: string
}

export type UnretriedDocumentIndexFailuresQueryObject = {
  readonly cutoff: Date
  readonly failedJobId?: string
  readonly projectId?: string
}

export type DocumentIndexFailureDocumentQueryObject = {
  readonly documentId: string
}

export type ExpiredDocumentIndexFailuresQueryObject = {
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

export interface ArchiveDocumentIndexFailureQueryObject extends NewDocumentIndexFailureFields {
  readonly id?: string
  readonly createdAt?: Date
  readonly updatedAt?: Date
}

export interface ArchiveDocumentIndexFailuresQueryObject {
  readonly failedJobs: readonly ArchiveDocumentIndexFailureQueryObject[]
}

export interface RemoveDocumentIndexFailuresQueryObject {
  readonly failedJobIds: readonly string[]
}
