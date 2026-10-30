export interface DocumentIdQueryObject {
  readonly documentId: string
}

export interface DocumentIdsQueryObject {
  readonly ids: readonly string[]
}

export interface DocumentGarbageCandidatesQueryObject {
  readonly cutoff: Date
}

export interface UpsertDocumentSourceQueryObject {
  readonly id: string
  readonly sourceType: string
  readonly sourceKey: string
  readonly sourcePath: string
  readonly createdAt: Date
  readonly unreferencedSince: Date | null
}

export interface UpsertDocumentSourceTitleQueryObject extends UpsertDocumentSourceQueryObject {
  readonly currentTitle: string | null
}

export interface MarkDocumentUnreferencedQueryObject extends DocumentIdQueryObject {
  readonly unreferencedSince: Date
}

export interface DocumentSourceQueryObject {
  readonly sourceType: string
  readonly sourceKey: string
  readonly sourcePath: string
}
