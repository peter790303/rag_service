import type { DocumentRevision } from '../../../../Domain/Entities/document-revision.ts'
import type { CreateDocumentRevisionQO } from '../../../QueryObjects/document-revision.query-object.ts'
import type { DocumentRevisionContentQO } from '../../../QueryObjects/document-revision.query-object.ts'
import type { DocumentRevisionDocumentQO } from '../../../QueryObjects/document-revision.query-object.ts'
import type { DocumentRevisionDocumentScopeQO } from '../../../QueryObjects/document-revision.query-object.ts'
import type { DocumentRevisionGarbageCandidatesQO } from '../../../QueryObjects/document-revision.query-object.ts'
import type { DocumentRevisionIdQO } from '../../../QueryObjects/document-revision.query-object.ts'
import type { DocumentRevisionIdsQO } from '../../../QueryObjects/document-revision.query-object.ts'

export abstract class DocumentRevisionRepository {
  abstract findByDocumentIdAndContentSha256(
    documentRevisionContentQO: DocumentRevisionContentQO,
  ): Promise<DocumentRevision | null>

  abstract create(createDocumentRevisionQO: CreateDocumentRevisionQO): Promise<void>

  abstract findByDocumentIdOrderByCreatedAtDesc(
    documentRevisionDocumentQO: DocumentRevisionDocumentQO,
  ): Promise<DocumentRevision | null>

  abstract findByDocumentRevisionIdAndDocumentId(
    documentRevisionDocumentScopeQO: DocumentRevisionDocumentScopeQO,
  ): Promise<DocumentRevision | null>

  abstract findByCreatedAtLessThanOrEqual(
    documentRevisionGarbageCandidatesQO: DocumentRevisionGarbageCandidatesQO,
  ): Promise<DocumentRevision[]>

  abstract lockByDocumentRevisionId(documentRevisionIdQO: DocumentRevisionIdQO): Promise<DocumentRevision | null>

  abstract findByDocumentRevisionId(documentRevisionIdQO: DocumentRevisionIdQO): Promise<DocumentRevision | null>

  abstract deleteByDocumentRevisionId(documentRevisionIdQO: DocumentRevisionIdQO): Promise<void>

  abstract findByDocumentRevisionIds(documentRevisionIdsQO: DocumentRevisionIdsQO): Promise<DocumentRevision[]>
}
