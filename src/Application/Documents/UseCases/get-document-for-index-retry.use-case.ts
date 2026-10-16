import type { Document } from '../../../Domain/Document/document.ts'
import { DocumentSourceTypeEnum } from '../../../Domain/Document/Enums/document-source-type.enum.ts'
import type { DocumentRepository } from '../Contracts/document.repository.ts'
import type { GetDocumentForIndexRetryUseCaseContract } from '../Contracts/get-document-for-index-retry.use-case.contract.ts'

/** Provides the source identity used to fence a manual indexing retry. */
export class GetDocumentForIndexRetryUseCase implements GetDocumentForIndexRetryUseCaseContract {
  constructor(private readonly documents: DocumentRepository) {}

  async execute(getDocumentForIndexRetryDTO: { readonly documentId: string }): Promise<Document | null> {
    const documentIdQO = { documentId: getDocumentForIndexRetryDTO.documentId }
    const document = await this.documents.findByDocumentId(documentIdQO)

    if (
      document !== null &&
      document.sourceType !== DocumentSourceTypeEnum.OBSIDIAN &&
      document.sourceType !== DocumentSourceTypeEnum.REPOSITORY
    )
      return null

    return document
  }
}
