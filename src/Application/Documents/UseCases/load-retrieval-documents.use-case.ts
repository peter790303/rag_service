import type { Document } from '../../../Domain/Document/document.ts'
import type { DocumentRepository } from '../Contracts/document.repository.ts'
import { LoadRetrievalDocumentsUseCaseContract } from '../Contracts/load-retrieval-documents.use-case.contract.ts'
import type { LoadRetrievalDocumentsDto } from '../DataTransferObjects/load-retrieval-documents.dto.ts'

/** Publishes only the facts in this feature's requested retrieval scope. */
export class LoadRetrievalDocumentsUseCase extends LoadRetrievalDocumentsUseCaseContract {
  constructor(private readonly documentRepository: DocumentRepository) {
    super()
  }

  async execute(loadRetrievalDocumentsDTO: LoadRetrievalDocumentsDto): Promise<Document[]> {
    const { documentIds } = loadRetrievalDocumentsDTO
    const uniqueRetrievalDocumentIds = [...new Set(documentIds)]

    if (uniqueRetrievalDocumentIds.length === 0) return []

    const retrievalScopeDocuments = await this.documentRepository.findByDocumentIds({ ids: uniqueRetrievalDocumentIds })

    return retrievalScopeDocuments.filter((retrievalDocument) =>
      uniqueRetrievalDocumentIds.includes(retrievalDocument.id),
    )
  }
}
