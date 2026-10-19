import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { PrepareDocumentRevisionForIndexRequestDTO } from '../DataTransferObjects/prepare-document-revision-for-index-request.dto.ts'

export abstract class PrepareDocumentRevisionForIndexRequestUseCaseContract {
  abstract execute(
    prepareDocumentRevisionForIndexRequestDTO: PrepareDocumentRevisionForIndexRequestDTO,
  ): Promise<DocumentRevision>
}
