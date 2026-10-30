import type { DocumentRevision } from '../../Domain/Entities/document-revision.ts'

export type CollectDocumentRevisionGarbageCommand = {
  scope: { readonly retentionCutoff: Date; readonly lockedDocumentIds: readonly string[] }
  candidates: readonly DocumentRevision[]
}
