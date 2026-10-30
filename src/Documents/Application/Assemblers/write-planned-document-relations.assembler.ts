import type { DocumentRelation } from '../../Domain/Entities/document-relation.ts'
import type { InsertPlannedDocumentRelationsQueryObject } from '../QueryObjects/document-relation.query-object.ts'

export class WritePlannedDocumentRelationsAssembler {
  static toInsertPlannedDocumentRelationsQueryObject(
    documentRelations: readonly DocumentRelation[],
  ): InsertPlannedDocumentRelationsQueryObject {
    return {
      relations: documentRelations.map((relation) => ({
        id: relation.id,
        sourceIndexId: relation.sourceIndexId,
        targetDocumentId: relation.targetDocumentId,
        targetReference: relation.targetReference,
        targetAnchor: relation.targetAnchor,
        relationType: relation.relationType,
        evidenceBlockStart: relation.evidenceBlockStart,
        evidenceBlockEnd: relation.evidenceBlockEnd,
        evidenceText: relation.evidenceText,
      })),
    }
  }
}
