import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { DocumentGarbageCollectionScopeDto } from '../../Documents/DataTransferObjects/document-garbage-collection-scope.dto.ts'

export type PlanDocumentRevisionGarbageDto = { retentionCutoff: Date }
export type CollectDocumentRevisionGarbageDto = {
  scope: DocumentGarbageCollectionScopeDto
  candidates: readonly DocumentRevision[]
}
