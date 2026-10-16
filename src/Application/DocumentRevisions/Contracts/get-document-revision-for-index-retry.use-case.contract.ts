import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'

export abstract class GetDocumentRevisionForIndexRetryUseCaseContract {
  abstract execute(getDocumentRevisionForIndexRetryDTO: {
    documentId: string
    revisionId: string
  }): Promise<DocumentRevision | null>
}
