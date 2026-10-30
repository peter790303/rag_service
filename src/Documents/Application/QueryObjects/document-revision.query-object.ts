export interface DocumentRevisionIdQueryObject {
  readonly revisionId: string
}

export interface DocumentRevisionIdsQueryObject {
  readonly ids: readonly string[]
}

export interface DocumentRevisionDocumentQueryObject {
  readonly documentId: string
}

export interface DocumentRevisionContentQueryObject extends DocumentRevisionDocumentQueryObject {
  readonly contentSha256: string
}

export interface DocumentRevisionDocumentScopeQueryObject extends DocumentRevisionDocumentQueryObject {
  readonly revisionId: string
}

export interface DocumentRevisionGarbageCandidatesQueryObject {
  readonly cutoff: Date
}

export interface CreateDocumentRevisionQueryObject {
  readonly id: string
  readonly documentId: string
  readonly contentSha256: string
  readonly title: string | null
  readonly content: string
  readonly capturedAt: Date
  readonly createdAt: Date
}
