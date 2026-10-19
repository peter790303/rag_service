import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { CollectDocumentRevisionGarbageDTO } from '../DataTransferObjects/document-revision-garbage.dto.ts'

export abstract class CollectDocumentRevisionGarbageUseCaseContract {
  abstract execute(collectDocumentRevisionGarbageDTO: CollectDocumentRevisionGarbageDTO): Promise<DocumentRevision[]>
}
