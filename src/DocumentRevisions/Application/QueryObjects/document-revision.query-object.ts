export interface DocumentRevisionIdQO {
  readonly revisionId: string
}

export interface DocumentRevisionIdsQO {
  readonly ids: readonly string[]
}

export interface DocumentRevisionDocumentQO {
  readonly documentId: string
}

export interface DocumentRevisionContentQO extends DocumentRevisionDocumentQO {
  readonly contentSha256: string
}

export interface DocumentRevisionDocumentScopeQO extends DocumentRevisionDocumentQO {
  readonly revisionId: string
}

export interface DocumentRevisionGarbageCandidatesQO {
  readonly cutoff: Date
}

export interface CreateDocumentRevisionQO {
  readonly id: string
  readonly documentId: string
  readonly contentSha256: string
  readonly title: string | null
  readonly content: string
  readonly capturedAt: Date
  readonly createdAt: Date
}
