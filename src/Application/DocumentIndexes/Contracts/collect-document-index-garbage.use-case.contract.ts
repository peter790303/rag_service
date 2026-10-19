import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { CollectDocumentIndexGarbageDTO } from '../DataTransferObjects/document-index-garbage.dto.ts'

export abstract class CollectDocumentIndexGarbageUseCaseContract {
  abstract execute(collectDocumentIndexGarbageDTO: CollectDocumentIndexGarbageDTO): Promise<DocumentIndex[]>
}
