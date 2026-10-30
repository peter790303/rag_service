import type { InspectDocumentRevisionRetentionQuery } from './inspect-document-revision-retention.query.ts'
import type { DocumentRevision } from '../../Domain/Entities/document-revision.ts'
import type { InspectDocumentRevisionRetentionQueryHandlerContract } from '../Contracts/inspect-document-revision-retention.query.handler.contract.ts'
import type { DocumentRevisionRepository } from '../Ports/Out/Repositories/document-revision.repository.ts'

export class InspectDocumentRevisionRetentionQueryHandler implements InspectDocumentRevisionRetentionQueryHandlerContract {
  constructor(private readonly documentRevisionRepository: DocumentRevisionRepository) {}

  async execute(
    inspectDocumentRevisionRetentionQuery: InspectDocumentRevisionRetentionQuery,
  ): Promise<DocumentRevision | null> {
    const documentRevisionDocumentQO = { documentId: inspectDocumentRevisionRetentionQuery.documentId }

    return this.documentRevisionRepository.findByDocumentIdOrderByCreatedAtDesc(documentRevisionDocumentQO)
  }
}
