import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import type { DocumentRelationSourceIndexQueryObject } from '../QueryObjects/document-relation.query-object.ts'
import type { DocumentRelationSourceIndexesQueryObject } from '../QueryObjects/document-relation.query-object.ts'
import type { DocumentRelationTargetDocumentQueryObject } from '../QueryObjects/document-relation.query-object.ts'
import type { InsertPlannedDocumentRelationsQueryObject } from '../QueryObjects/document-relation.query-object.ts'

export abstract class DocumentRelationRepository {
  abstract insertPlanned(insertPlannedDocumentRelationsQO: InsertPlannedDocumentRelationsQueryObject): Promise<void>

  abstract findBySourceIndexId(
    documentRelationSourceIndexQO: DocumentRelationSourceIndexQueryObject,
  ): Promise<DocumentRelation[]>

  abstract removeBySourceIndexId(documentRelationSourceIndexQO: DocumentRelationSourceIndexQueryObject): Promise<void>

  abstract findByTargetDocumentId(
    documentRelationTargetDocumentQO: DocumentRelationTargetDocumentQueryObject,
  ): Promise<DocumentRelation | null>

  abstract findBySourceIndexIdsOrderByIdAsc(
    documentRelationSourceIndexesQO: DocumentRelationSourceIndexesQueryObject,
  ): Promise<DocumentRelation[]>
}
