import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import type { SavePlannedDocumentRelationsQueryObject } from '../QueryObjects/document-relation.query-object.ts'

export class WritePlannedDocumentRelationsAssembler {
  static toSavePlannedDocumentRelationsQueryObject(
    documentRelations: readonly DocumentRelation[],
  ): SavePlannedDocumentRelationsQueryObject {
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
