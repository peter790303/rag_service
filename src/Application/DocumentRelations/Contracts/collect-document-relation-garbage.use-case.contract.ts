import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import type { CollectDocumentRelationGarbageDTO } from '../DataTransferObjects/document-relation-garbage.dto.ts'

export abstract class CollectDocumentRelationGarbageUseCaseContract {
  abstract execute(
    collectDocumentRelationGarbageDTO: CollectDocumentRelationGarbageDTO,
  ): Promise<DocumentRelation[] | null>
}
