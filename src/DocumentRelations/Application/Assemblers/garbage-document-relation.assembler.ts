import type { DocumentRelation } from '../../Domain/Entities/document-relation.ts'
import type { CollectDocumentRelationGarbageCommand } from '../Commands/collect-document-relation-garbage.command.ts'
import type { PlanDocumentRelationGarbageQuery } from '../Queries/plan-document-relation-garbage.query.ts'
import type {
  DocumentRelationSourceIndexQO,
  DocumentRelationSourceIndexesQO,
  DocumentRelationTargetDocumentQO,
} from '../QueryObjects/document-relation.query-object.ts'

export class GarbageDocumentRelationAssembler {
  static toDocumentRelationSourceIndexesQO(
    planDocumentRelationGarbageQuery: PlanDocumentRelationGarbageQuery,
  ): DocumentRelationSourceIndexesQO {
    return { sourceIndexIds: [...planDocumentRelationGarbageQuery.sourceIndexIds] }
  }

  static toCollectionDocumentRelationSourceIndexesQO(
    collectDocumentRelationGarbageCommand: CollectDocumentRelationGarbageCommand,
  ): DocumentRelationSourceIndexesQO {
    return { sourceIndexIds: [collectDocumentRelationGarbageCommand.sourceIndexId] }
  }

  static toDocumentRelationSourceIndexQO(
    collectDocumentRelationGarbageCommand: CollectDocumentRelationGarbageCommand,
  ): DocumentRelationSourceIndexQO {
    return { sourceIndexId: collectDocumentRelationGarbageCommand.sourceIndexId }
  }

  static toDocumentRelationTargetDocumentQO(documentId: string): DocumentRelationTargetDocumentQO {
    return { documentId }
  }

  static toTargetDocumentIds(relations: readonly DocumentRelation[]): string[] {
    return relations.flatMap((relation) => (relation.targetDocumentId === null ? [] : [relation.targetDocumentId]))
  }
}
