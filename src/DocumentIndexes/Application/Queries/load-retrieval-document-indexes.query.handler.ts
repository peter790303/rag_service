import type { LoadRetrievalDocumentIndexesQuery } from './load-retrieval-document-indexes.query.ts'
import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import { RetrievalDocumentIndexesAssembler } from '../Assemblers/retrieval-document-indexes.assembler.ts'
import { LoadRetrievalDocumentIndexesQueryHandlerContract } from '../Contracts/load-retrieval-document-indexes.query.handler.contract.ts'
import type { DocumentIndexRepository } from '../Ports/Out/Repositories/document-index.repository.ts'

/** Publishes only the facts in this feature's requested retrieval scope. */
export class LoadRetrievalDocumentIndexesQueryHandler extends LoadRetrievalDocumentIndexesQueryHandlerContract {
  constructor(private readonly documentIndexRepository: DocumentIndexRepository) {
    super()
  }

  async execute(loadRetrievalDocumentIndexesQuery: LoadRetrievalDocumentIndexesQuery): Promise<DocumentIndex[]> {
    const { documentIds } = RetrievalDocumentIndexesAssembler.toLoadRetrievalDocumentIndexesQuery(
      loadRetrievalDocumentIndexesQuery,
    )
    const uniqueRetrievalDocumentIds = [...new Set(documentIds)]

    if (uniqueRetrievalDocumentIds.length === 0) return []

    const retrievalScopeDocumentIndexes =
      await this.documentIndexRepository.findByDocumentIdsOrderByCreatedAtAscAndIdAsc({
        documentIds: uniqueRetrievalDocumentIds,
      })

    return retrievalScopeDocumentIndexes.filter((retrievalDocumentIndex) =>
      uniqueRetrievalDocumentIds.includes(retrievalDocumentIndex.documentId),
    )
  }
}
