import { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import type { DocumentRelationModel } from '../Models/document-relation.model.ts'

export class DocumentRelationFactory {
  static toDocumentRelation(model: DocumentRelationModel): DocumentRelation {
    return new DocumentRelation({
      id: model.id,
      sourceIndexId: model.sourceIndexId,
      targetDocumentId: model.targetDocumentId,
      targetReference: model.targetReference,
      targetAnchor: model.targetAnchor,
      relationType: model.relationType,
      evidenceBlockStart: model.evidenceBlockStart,
      evidenceBlockEnd: model.evidenceBlockEnd,
      evidenceText: model.evidenceText,
    })
  }
}
