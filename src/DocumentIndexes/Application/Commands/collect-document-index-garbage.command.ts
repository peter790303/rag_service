import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'

export type CollectDocumentIndexGarbageCommand = {
  scope: { retentionCutoff: Date; lockedDocumentIds: readonly string[] }
  candidates: readonly DocumentIndex[]
}
