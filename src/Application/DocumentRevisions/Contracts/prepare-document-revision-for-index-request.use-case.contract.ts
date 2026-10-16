import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { SourceDocumentDto } from '../../Documents/DataTransferObjects/source-document.dto.ts'

export abstract class PrepareDocumentRevisionForIndexRequestUseCaseContract {
  abstract execute(prepareDocumentRevisionForIndexRequestDTO: {
    sourceDocument: SourceDocumentDto
    documentId: string
    contentSha256: string
  }): Promise<DocumentRevision>
}
