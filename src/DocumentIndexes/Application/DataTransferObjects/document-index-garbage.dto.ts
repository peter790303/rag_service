import type { ExpiredDocumentIndexFailureDTO } from './expired-document-index-failure.dto.ts'
import type { DocumentGarbageCollectionScopeDTO } from '../../../Documents/Application/DataTransferObjects/document-garbage-collection-scope.dto.ts'
import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'

export type CollectDocumentIndexGarbageDTO = {
  scope: DocumentGarbageCollectionScopeDTO
  candidates: readonly DocumentIndex[]
}
export type DocumentIndexRetentionDTO = { documentId: string } | { revisionId: string }
export type StartDocumentIndexPruningRetentionDTO = { documentIndexIds: readonly string[]; now: Date }
export type PlanDocumentIndexGarbageDTO = { retentionCutoff: Date }

export type DocumentIndexGarbagePlanDTO = { failures: ExpiredDocumentIndexFailureDTO[]; indexes: DocumentIndex[] }
