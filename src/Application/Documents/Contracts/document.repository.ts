import type { Document } from '../../../Domain/Document/document.ts'
import type { DocumentGarbageCandidatesQueryObject } from '../QueryObjects/document.query-object.ts'
import type { DocumentIdQueryObject } from '../QueryObjects/document.query-object.ts'
import type { DocumentIdsQueryObject } from '../QueryObjects/document.query-object.ts'
import type {
  DocumentSourceQueryObject,
  MarkDocumentUnreferencedQueryObject,
  UpsertDocumentSourceQueryObject,
  UpsertDocumentSourceTitleQueryObject,
} from '../QueryObjects/document.query-object.ts'

export abstract class DocumentRepository {
  abstract upsertBySourceTypeAndSourceKeyAndSourcePath(
    upsertDocumentSourceQO: UpsertDocumentSourceQueryObject,
  ): Promise<void>

  abstract upsertTitleBySourceTypeAndSourceKeyAndSourcePath(
    upsertDocumentSourceTitleQO: UpsertDocumentSourceTitleQueryObject,
  ): Promise<void>

  abstract findBySourceTypeAndSourceKeyAndSourcePath(
    documentSourceQO: DocumentSourceQueryObject,
  ): Promise<Document | null>

  abstract lockByDocumentId(documentIdQO: DocumentIdQueryObject): Promise<Document | null>

  abstract findByDocumentId(documentIdQO: DocumentIdQueryObject): Promise<Document | null>

  abstract lockByDocumentIdSkipLocked(documentIdQO: DocumentIdQueryObject): Promise<Document | null>

  abstract findByUnreferencedSinceLessThanOrEqual(
    documentGarbageCandidatesQO: DocumentGarbageCandidatesQueryObject,
  ): Promise<Document[]>

  abstract updateUnreferencedSinceByDocumentIdAndUnreferencedSinceIsNull(
    markDocumentUnreferencedQO: MarkDocumentUnreferencedQueryObject,
  ): Promise<void>

  abstract deleteByDocumentId(documentIdQO: DocumentIdQueryObject): Promise<void>

  abstract findByDocumentIds(documentIdsQO: DocumentIdsQueryObject): Promise<Document[]>
}
