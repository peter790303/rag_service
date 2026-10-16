import type { DocumentIndexRecordDto } from './document-index-record.dto.ts'
import type { ExpiredDocumentIndexFailureDto } from './expired-document-index-failure.dto.ts'
import type { DocumentGarbageCollectionScopeDto } from '../../Documents/DataTransferObjects/document-garbage-collection-scope.dto.ts'

export type DocumentIndexGarbagePlanDto = {
  failedJobs: readonly ExpiredDocumentIndexFailureDto[]
  indexes: readonly DocumentIndexRecordDto[]
}
export type CollectDocumentIndexGarbageDto = {
  scope: DocumentGarbageCollectionScopeDto
  plan: DocumentIndexGarbagePlanDto
}
export type DocumentIndexRetentionDto = { documentId: string } | { revisionId: string }
export type StartDocumentIndexPruningRetentionDto = { documentIndexIds: readonly string[]; now: Date }
export type PlanDocumentIndexGarbageDto = { retentionCutoff: Date }
