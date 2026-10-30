import type { DocumentRelation } from '../../../../Domain/Entities/document-relation.ts'
import type { DocumentRelationSourceIndexQO } from '../../../QueryObjects/document-relation.query-object.ts'
import type { DocumentRelationSourceIndexesQO } from '../../../QueryObjects/document-relation.query-object.ts'
import type { DocumentRelationTargetDocumentQO } from '../../../QueryObjects/document-relation.query-object.ts'
import type { InsertPlannedDocumentRelationsQO } from '../../../QueryObjects/document-relation.query-object.ts'

export abstract class DocumentRelationRepository {
  abstract insertPlanned(insertPlannedDocumentRelationsQO: InsertPlannedDocumentRelationsQO): Promise<void>

  abstract findBySourceIndexId(
    documentRelationSourceIndexQO: DocumentRelationSourceIndexQO,
  ): Promise<DocumentRelation[]>

  abstract removeBySourceIndexId(documentRelationSourceIndexQO: DocumentRelationSourceIndexQO): Promise<void>

  abstract findByTargetDocumentId(
    documentRelationTargetDocumentQO: DocumentRelationTargetDocumentQO,
  ): Promise<DocumentRelation | null>

  abstract findBySourceIndexIdsOrderByIdAsc(
    documentRelationSourceIndexesQO: DocumentRelationSourceIndexesQO,
  ): Promise<DocumentRelation[]>
}
