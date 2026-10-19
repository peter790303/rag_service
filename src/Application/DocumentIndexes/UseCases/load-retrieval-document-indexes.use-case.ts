import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import { RetrievalDocumentIndexesAssembler } from '../Assemblers/retrieval-document-indexes.assembler.ts'
import type { DocumentIndexRepository } from '../Contracts/document-index.repository.ts'
import { LoadRetrievalDocumentIndexesUseCaseContract } from '../Contracts/load-retrieval-document-indexes.use-case.contract.ts'
import type { LoadRetrievalDocumentIndexesDTO } from '../DataTransferObjects/load-retrieval-document-indexes.dto.ts'

/** Publishes only the facts in this feature's requested retrieval scope. */
export class LoadRetrievalDocumentIndexesUseCase extends LoadRetrievalDocumentIndexesUseCaseContract {
  constructor(private readonly documentIndexRepository: DocumentIndexRepository) {
    super()
  }

  async execute(loadRetrievalDocumentIndexesDTO: LoadRetrievalDocumentIndexesDTO): Promise<DocumentIndex[]> {
    const { documentIds } = RetrievalDocumentIndexesAssembler.toLoadRetrievalDocumentIndexesDTO(
      loadRetrievalDocumentIndexesDTO,
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
