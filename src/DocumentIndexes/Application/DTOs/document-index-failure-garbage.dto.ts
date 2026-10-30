import type { ExpiredDocumentIndexFailureDTO } from './expired-document-index-failure.dto.ts'
import type { DocumentGarbageCollectionScopeDTO } from '../../../Documents/Application/DTOs/document-garbage-collection-scope.dto.ts'

export interface CollectDocumentIndexFailureGarbageDTO {
  readonly scope: DocumentGarbageCollectionScopeDTO
  readonly candidates: readonly ExpiredDocumentIndexFailureDTO[]
}
