import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'

export abstract class LoadDocumentRevisionUseCaseContract {
  abstract execute(loadDocumentRevisionDTO: { readonly revisionId: string }): Promise<DocumentRevision | null>
}
