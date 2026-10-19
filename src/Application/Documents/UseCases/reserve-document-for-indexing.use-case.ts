import type { Document } from '../../../Domain/Document/document.ts'
import type { DocumentRepository } from '../Contracts/document.repository.ts'
import type { ReserveDocumentForIndexingUseCaseContract } from '../Contracts/reserve-document-for-indexing.use-case.contract.ts'

/** Holds the source row before indexing takes knowledgeBaseDocument or job locks. */
export class ReserveDocumentForIndexingUseCase implements ReserveDocumentForIndexingUseCaseContract {
  constructor(private readonly documents: DocumentRepository) {}

  async execute(reserveDocumentForIndexingDTO: { documentId: string; skipLocked?: boolean }): Promise<Document | null> {
    const documentIdQO = { documentId: reserveDocumentForIndexingDTO.documentId }
    const document = reserveDocumentForIndexingDTO.skipLocked
      ? await this.documents.lockByDocumentIdSkipLocked(documentIdQO)
      : await this.documents.lockByDocumentId(documentIdQO)

    return document
  }
}
