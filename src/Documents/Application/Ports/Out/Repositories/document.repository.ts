import type { Document } from '../../../../Domain/Entities/document.ts'
import type { DocumentGarbageCandidatesQO } from '../../../QueryObjects/document.query-object.ts'
import type { DocumentIdQO } from '../../../QueryObjects/document.query-object.ts'
import type { DocumentIdsQO } from '../../../QueryObjects/document.query-object.ts'
import type {
  DocumentSourceQO,
  MarkDocumentUnreferencedQO,
  UpsertDocumentSourceQO,
  UpsertDocumentSourceTitleQO,
} from '../../../QueryObjects/document.query-object.ts'

export abstract class DocumentRepository {
  abstract upsertBySourceTypeAndSourceKeyAndSourcePath(upsertDocumentSourceQO: UpsertDocumentSourceQO): Promise<void>

  abstract upsertTitleBySourceTypeAndSourceKeyAndSourcePath(
    upsertDocumentSourceTitleQO: UpsertDocumentSourceTitleQO,
  ): Promise<void>

  abstract findBySourceTypeAndSourceKeyAndSourcePath(documentSourceQO: DocumentSourceQO): Promise<Document | null>

  abstract lockByDocumentId(documentIdQO: DocumentIdQO): Promise<Document | null>

  abstract findByDocumentId(documentIdQO: DocumentIdQO): Promise<Document | null>

  abstract lockByDocumentIdSkipLocked(documentIdQO: DocumentIdQO): Promise<Document | null>

  abstract findByUnreferencedSinceLessThanOrEqual(
    documentGarbageCandidatesQO: DocumentGarbageCandidatesQO,
  ): Promise<Document[]>

  abstract updateUnreferencedSinceByDocumentIdAndUnreferencedSinceIsNull(
    markDocumentUnreferencedQO: MarkDocumentUnreferencedQO,
  ): Promise<void>

  abstract deleteByDocumentId(documentIdQO: DocumentIdQO): Promise<void>

  abstract findByDocumentIds(documentIdsQO: DocumentIdsQO): Promise<Document[]>
}
