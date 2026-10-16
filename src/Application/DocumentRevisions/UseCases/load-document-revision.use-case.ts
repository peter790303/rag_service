import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { DocumentRevisionRepository } from '../Contracts/document-revision.repository.ts'
import type { LoadDocumentRevisionUseCaseContract } from '../Contracts/load-document-revision.use-case.contract.ts'

export class LoadDocumentRevisionUseCase implements LoadDocumentRevisionUseCaseContract {
  constructor(private readonly revisions: DocumentRevisionRepository) {}

  async execute(loadDocumentRevisionDTO: { readonly revisionId: string }): Promise<DocumentRevision | null> {
    const documentRevisionIdQO = { revisionId: loadDocumentRevisionDTO.revisionId }

    return this.revisions.findByDocumentRevisionId(documentRevisionIdQO)
  }
}
