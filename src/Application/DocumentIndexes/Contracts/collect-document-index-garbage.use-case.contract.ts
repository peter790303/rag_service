import type { DocumentGarbageCollectionResultDto } from '../../Documents/DataTransferObjects/document-garbage-collection-scope.dto.ts'
import type { CollectDocumentIndexGarbageDto } from '../DataTransferObjects/document-index-garbage.dto.ts'

export abstract class CollectDocumentIndexGarbageUseCaseContract {
  abstract execute(
    collectDocumentIndexGarbageDTO: CollectDocumentIndexGarbageDto,
  ): Promise<DocumentGarbageCollectionResultDto>
}
