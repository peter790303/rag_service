import type { DocumentIndex } from '../../../../Domain/Entities/document-index.ts'
import type {
  CreateBuildingDocumentIndexQueryObject,
  SaveDocumentIndexLifecycleQueryObject,
  SetDocumentIndexUnreferencedSinceQueryObject,
} from '../../../QueryObjects/document-index.query-object.ts'
import type { DocumentIndexDocumentQueryObject } from '../../../QueryObjects/document-index.query-object.ts'
import type { DocumentIndexDocumentsQueryObject } from '../../../QueryObjects/document-index.query-object.ts'
import type { DocumentIndexGarbageCandidatesQueryObject } from '../../../QueryObjects/document-index.query-object.ts'
import type { DocumentIndexIdQueryObject } from '../../../QueryObjects/document-index.query-object.ts'
import type { DocumentIndexRevisionPipelineQueryObject } from '../../../QueryObjects/document-index.query-object.ts'
import type { DocumentIndexRevisionQueryObject } from '../../../QueryObjects/document-index.query-object.ts'

export abstract class DocumentIndexRepository {
  abstract findByDocumentRevisionIdAndPipelineHash(
    documentIndexRevisionPipelineQO: DocumentIndexRevisionPipelineQueryObject,
  ): Promise<DocumentIndex | null>

  abstract createBuildingIndex(createBuildingDocumentIndexQO: CreateBuildingDocumentIndexQueryObject): Promise<void>

  abstract lockByDocumentIndexId(documentIndexIdQO: DocumentIndexIdQueryObject): Promise<DocumentIndex | null>

  abstract lockByDocumentIndexIdSkipLocked(documentIndexIdQO: DocumentIndexIdQueryObject): Promise<DocumentIndex | null>

  abstract deleteByDocumentIndexId(documentIndexIdQO: DocumentIndexIdQueryObject): Promise<void>

  abstract findByDocumentIndexId(documentIndexIdQO: DocumentIndexIdQueryObject): Promise<DocumentIndex | null>

  abstract updateByDocumentIndexIdWithLifecycleFields(
    saveDocumentIndexLifecycleQO: SaveDocumentIndexLifecycleQueryObject,
  ): Promise<void>

  abstract updateByDocumentIndexIdWithUnreferencedSince(
    setDocumentIndexUnreferencedSinceQO: SetDocumentIndexUnreferencedSinceQueryObject,
  ): Promise<void>

  abstract findByDocumentId(documentIndexDocumentQO: DocumentIndexDocumentQueryObject): Promise<DocumentIndex[]>

  abstract findByRevisionId(documentIndexRevisionQO: DocumentIndexRevisionQueryObject): Promise<DocumentIndex[]>

  abstract findByUnreferencedSinceLessThanOrEqualOrderByIdAsc(
    documentIndexGarbageCandidatesQO: DocumentIndexGarbageCandidatesQueryObject,
  ): Promise<DocumentIndex[]>

  abstract findByDocumentIdsOrderByCreatedAtAscAndIdAsc(
    documentIndexDocumentsQO: DocumentIndexDocumentsQueryObject,
  ): Promise<DocumentIndex[]>
}
