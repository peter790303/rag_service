import type { LoadRetrievalDocumentsQuery } from './load-retrieval-documents.query.ts'
import type { Document } from '../../Domain/Entities/document.ts'
import { RetrievalDocumentsAssembler } from '../Assemblers/retrieval-documents.assembler.ts'
import { LoadRetrievalDocumentsQueryHandlerContract } from '../Contracts/load-retrieval-documents.query.handler.contract.ts'
import type { DocumentRepository } from '../Ports/Out/Repositories/document.repository.ts'

/** Publishes only the facts in this feature's requested retrieval scope. */
export class LoadRetrievalDocumentsQueryHandler extends LoadRetrievalDocumentsQueryHandlerContract {
  constructor(private readonly documentRepository: DocumentRepository) {
    super()
  }

  async execute(loadRetrievalDocumentsDTO: LoadRetrievalDocumentsQuery): Promise<Document[]> {
    const { documentIds } = RetrievalDocumentsAssembler.toLoadRetrievalDocumentsDTO(loadRetrievalDocumentsDTO)
    const uniqueRetrievalDocumentIds = [...new Set(documentIds)]

    if (uniqueRetrievalDocumentIds.length === 0) return []

    const retrievalScopeDocuments = await this.documentRepository.findByDocumentIds({ ids: uniqueRetrievalDocumentIds })

    return retrievalScopeDocuments.filter((retrievalDocument) =>
      uniqueRetrievalDocumentIds.includes(retrievalDocument.id),
    )
  }
}
