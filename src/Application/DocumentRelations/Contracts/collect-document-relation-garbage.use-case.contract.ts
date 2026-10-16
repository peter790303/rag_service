import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import type { CollectDocumentRelationGarbageDto } from '../DataTransferObjects/document-relation-garbage.dto.ts'

export abstract class CollectDocumentRelationGarbageUseCaseContract {
  abstract execute(
    collectDocumentRelationGarbageDTO: CollectDocumentRelationGarbageDto,
  ): Promise<DocumentRelation[] | null>
}
