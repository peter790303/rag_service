import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { DocumentGarbageCollectionScopeDTO } from '../../Documents/DataTransferObjects/document-garbage-collection-scope.dto.ts'

export type CollectDocumentIndexGarbageDTO = {
  scope: DocumentGarbageCollectionScopeDTO
  candidates: readonly DocumentIndex[]
}
export type DocumentIndexRetentionDTO = { documentId: string } | { revisionId: string }
export type StartDocumentIndexPruningRetentionDTO = { documentIndexIds: readonly string[]; now: Date }
export type PlanDocumentIndexGarbageDTO = { retentionCutoff: Date }
