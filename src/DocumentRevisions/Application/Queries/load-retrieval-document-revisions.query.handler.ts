import type { LoadRetrievalDocumentRevisionsQuery } from './load-retrieval-document-revisions.query.ts'
import type { DocumentRevision } from '../../Domain/Entities/document-revision.ts'
import { RetrievalDocumentRevisionsAssembler } from '../Assemblers/retrieval-document-revisions.assembler.ts'
import { LoadRetrievalDocumentRevisionsQueryHandlerContract } from '../Contracts/load-retrieval-document-revisions.query.handler.contract.ts'
import type { DocumentRevisionRepository } from '../Ports/Out/Repositories/document-revision.repository.ts'

/** Publishes only the facts in this feature's requested retrieval scope. */
export class LoadRetrievalDocumentRevisionsQueryHandler extends LoadRetrievalDocumentRevisionsQueryHandlerContract {
  constructor(private readonly documentRevisionRepository: DocumentRevisionRepository) {
    super()
  }

  async execute(loadRetrievalDocumentRevisionsQuery: LoadRetrievalDocumentRevisionsQuery): Promise<DocumentRevision[]> {
    const { revisionIds } = RetrievalDocumentRevisionsAssembler.toLoadRetrievalDocumentRevisionsQuery(
      loadRetrievalDocumentRevisionsQuery,
    )
    const uniqueRetrievalDocumentRevisionIds = [...new Set(revisionIds)]

    if (uniqueRetrievalDocumentRevisionIds.length === 0) return []

    const retrievalScopeDocumentRevisions = await this.documentRevisionRepository.findByDocumentRevisionIds({
      ids: uniqueRetrievalDocumentRevisionIds,
    })

    return retrievalScopeDocumentRevisions.filter((retrievalDocumentRevision) =>
      uniqueRetrievalDocumentRevisionIds.includes(retrievalDocumentRevision.id),
    )
  }
}
