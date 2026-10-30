export interface DocumentIdQO {
  readonly documentId: string
}

export interface DocumentIdsQO {
  readonly ids: readonly string[]
}

export interface DocumentGarbageCandidatesQO {
  readonly cutoff: Date
}

export interface UpsertDocumentSourceQO {
  readonly id: string
  readonly sourceType: string
  readonly sourceKey: string
  readonly sourcePath: string
  readonly createdAt: Date
  readonly unreferencedSince: Date | null
}

export interface UpsertDocumentSourceTitleQO extends UpsertDocumentSourceQO {
  readonly currentTitle: string | null
}

export interface MarkDocumentUnreferencedQO extends DocumentIdQO {
  readonly unreferencedSince: Date
}

export interface DocumentSourceQO {
  readonly sourceType: string
  readonly sourceKey: string
  readonly sourcePath: string
}
