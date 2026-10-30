import type { LoadDocumentRevisionQuery } from './load-document-revision.query.ts'
import type { DocumentRevision } from '../../Domain/Entities/document-revision.ts'
import type { LoadDocumentRevisionQueryHandlerContract } from '../Contracts/load-document-revision.query.handler.contract.ts'
import type { DocumentRevisionRepository } from '../Ports/Out/Repositories/document-revision.repository.ts'

export class LoadDocumentRevisionQueryHandler implements LoadDocumentRevisionQueryHandlerContract {
  constructor(private readonly revisions: DocumentRevisionRepository) {}

  async execute(loadDocumentRevisionDTO: LoadDocumentRevisionQuery): Promise<DocumentRevision | null> {
    const documentRevisionIdQO = { revisionId: loadDocumentRevisionDTO.revisionId }

    return this.revisions.findByDocumentRevisionId(documentRevisionIdQO)
  }
}
