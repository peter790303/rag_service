import type { DocumentIndex } from '../../../../Domain/Entities/document-index.ts'
import type {
  CreateBuildingDocumentIndexQO,
  SaveDocumentIndexLifecycleQO,
  SetDocumentIndexUnreferencedSinceQO,
} from '../../../QueryObjects/document-index.query-object.ts'
import type { DocumentIndexDocumentQO } from '../../../QueryObjects/document-index.query-object.ts'
import type { DocumentIndexDocumentsQO } from '../../../QueryObjects/document-index.query-object.ts'
import type { DocumentIndexGarbageCandidatesQO } from '../../../QueryObjects/document-index.query-object.ts'
import type { DocumentIndexIdQO } from '../../../QueryObjects/document-index.query-object.ts'
import type { DocumentIndexRevisionPipelineQO } from '../../../QueryObjects/document-index.query-object.ts'
import type { DocumentIndexRevisionQO } from '../../../QueryObjects/document-index.query-object.ts'

export abstract class DocumentIndexRepository {
  abstract findByDocumentRevisionIdAndPipelineHash(
    documentIndexRevisionPipelineQO: DocumentIndexRevisionPipelineQO,
  ): Promise<DocumentIndex | null>

  abstract createBuildingIndex(createBuildingDocumentIndexQO: CreateBuildingDocumentIndexQO): Promise<void>

  abstract lockByDocumentIndexId(documentIndexIdQO: DocumentIndexIdQO): Promise<DocumentIndex | null>

  abstract lockByDocumentIndexIdSkipLocked(documentIndexIdQO: DocumentIndexIdQO): Promise<DocumentIndex | null>

  abstract deleteByDocumentIndexId(documentIndexIdQO: DocumentIndexIdQO): Promise<void>

  abstract findByDocumentIndexId(documentIndexIdQO: DocumentIndexIdQO): Promise<DocumentIndex | null>

  abstract updateByDocumentIndexIdWithLifecycleFields(
    saveDocumentIndexLifecycleQO: SaveDocumentIndexLifecycleQO,
  ): Promise<void>

  abstract updateByDocumentIndexIdWithUnreferencedSince(
    setDocumentIndexUnreferencedSinceQO: SetDocumentIndexUnreferencedSinceQO,
  ): Promise<void>

  abstract findByDocumentId(documentIndexDocumentQO: DocumentIndexDocumentQO): Promise<DocumentIndex[]>

  abstract findByRevisionId(documentIndexRevisionQO: DocumentIndexRevisionQO): Promise<DocumentIndex[]>

  abstract findByUnreferencedSinceLessThanOrEqualOrderByIdAsc(
    documentIndexGarbageCandidatesQO: DocumentIndexGarbageCandidatesQO,
  ): Promise<DocumentIndex[]>

  abstract findByDocumentIdsOrderByCreatedAtAscAndIdAsc(
    documentIndexDocumentsQO: DocumentIndexDocumentsQO,
  ): Promise<DocumentIndex[]>
}
