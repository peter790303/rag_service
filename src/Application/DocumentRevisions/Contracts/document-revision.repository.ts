import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { CreateDocumentRevisionQueryObject } from '../QueryObjects/document-revision.query-object.ts'
import type { DocumentRevisionContentQueryObject } from '../QueryObjects/document-revision.query-object.ts'
import type { DocumentRevisionDocumentQueryObject } from '../QueryObjects/document-revision.query-object.ts'
import type { DocumentRevisionDocumentScopeQueryObject } from '../QueryObjects/document-revision.query-object.ts'
import type { DocumentRevisionGarbageCandidatesQueryObject } from '../QueryObjects/document-revision.query-object.ts'
import type { DocumentRevisionIdQueryObject } from '../QueryObjects/document-revision.query-object.ts'
import type { DocumentRevisionIdsQueryObject } from '../QueryObjects/document-revision.query-object.ts'

export abstract class DocumentRevisionRepository {
  abstract findByDocumentIdAndContentSha256(
    documentRevisionContentQO: DocumentRevisionContentQueryObject,
  ): Promise<DocumentRevision | null>

  abstract create(createDocumentRevisionQO: CreateDocumentRevisionQueryObject): Promise<void>

  abstract findByDocumentIdOrderByCreatedAtDesc(
    documentRevisionDocumentQO: DocumentRevisionDocumentQueryObject,
  ): Promise<DocumentRevision | null>

  abstract findByDocumentRevisionIdAndDocumentId(
    documentRevisionDocumentScopeQO: DocumentRevisionDocumentScopeQueryObject,
  ): Promise<DocumentRevision | null>

  abstract findByCreatedAtLessThanOrEqual(
    documentRevisionGarbageCandidatesQO: DocumentRevisionGarbageCandidatesQueryObject,
  ): Promise<DocumentRevision[]>

  abstract lockByDocumentRevisionId(
    documentRevisionIdQO: DocumentRevisionIdQueryObject,
  ): Promise<DocumentRevision | null>

  abstract findByDocumentRevisionId(
    documentRevisionIdQO: DocumentRevisionIdQueryObject,
  ): Promise<DocumentRevision | null>

  abstract deleteByDocumentRevisionId(documentRevisionIdQO: DocumentRevisionIdQueryObject): Promise<void>

  abstract findByDocumentRevisionIds(documentRevisionIdsQO: DocumentRevisionIdsQueryObject): Promise<DocumentRevision[]>
}
