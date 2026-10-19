import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import type {
  PlanDocumentRelationGarbageDTO,
  CollectDocumentRelationGarbageDTO,
} from '../DataTransferObjects/document-relation-garbage.dto.ts'
import type {
  DocumentRelationSourceIndexQueryObject,
  DocumentRelationSourceIndexesQueryObject,
  DocumentRelationTargetDocumentQueryObject,
} from '../QueryObjects/document-relation.query-object.ts'

export class GarbageDocumentRelationAssembler {
  static toDocumentRelationSourceIndexesQueryObject(
    planDocumentRelationGarbageDTO: PlanDocumentRelationGarbageDTO,
  ): DocumentRelationSourceIndexesQueryObject {
    return { sourceIndexIds: [...planDocumentRelationGarbageDTO.sourceIndexIds] }
  }

  static toCollectionDocumentRelationSourceIndexesQueryObject(
    collectDocumentRelationGarbageDTO: CollectDocumentRelationGarbageDTO,
  ): DocumentRelationSourceIndexesQueryObject {
    return { sourceIndexIds: [collectDocumentRelationGarbageDTO.sourceIndexId] }
  }

  static toDocumentRelationSourceIndexQueryObject(
    collectDocumentRelationGarbageDTO: CollectDocumentRelationGarbageDTO,
  ): DocumentRelationSourceIndexQueryObject {
    return { sourceIndexId: collectDocumentRelationGarbageDTO.sourceIndexId }
  }

  static toDocumentRelationTargetDocumentQueryObject(documentId: string): DocumentRelationTargetDocumentQueryObject {
    return { documentId }
  }

  static toTargetDocumentIds(relations: readonly DocumentRelation[]): string[] {
    return relations.flatMap((relation) => (relation.targetDocumentId === null ? [] : [relation.targetDocumentId]))
  }
}
