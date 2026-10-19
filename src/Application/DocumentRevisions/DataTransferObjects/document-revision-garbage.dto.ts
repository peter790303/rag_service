import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'

export type PlanDocumentRevisionGarbageDTO = { retentionCutoff: Date }
export type DocumentRevisionGarbageScopeDTO = {
  readonly retentionCutoff: Date
  readonly lockedDocumentIds: readonly string[]
}
export type CollectDocumentRevisionGarbageDTO = {
  scope: DocumentRevisionGarbageScopeDTO
  candidates: readonly DocumentRevision[]
}
