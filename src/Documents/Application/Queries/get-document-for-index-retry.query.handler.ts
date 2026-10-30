import type { GetDocumentForIndexRetryQuery } from './get-document-for-index-retry.query.ts'
import type { Document } from '../../Domain/Entities/document.ts'
import { DocumentSourceTypeEnum } from '../../Domain/Enums/document-source-type.enum.ts'
import type { GetDocumentForIndexRetryQueryHandlerContract } from '../Contracts/get-document-for-index-retry.query.handler.contract.ts'
import type { DocumentRepository } from '../Ports/Out/Repositories/document.repository.ts'

/** Provides the source identity used to fence a manual indexing retry. */
export class GetDocumentForIndexRetryQueryHandler implements GetDocumentForIndexRetryQueryHandlerContract {
  constructor(private readonly documents: DocumentRepository) {}

  async execute(getDocumentForIndexRetryDTO: GetDocumentForIndexRetryQuery): Promise<Document | null> {
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
