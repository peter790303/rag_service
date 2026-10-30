import type { Document } from '../../Domain/Entities/document.ts'
import type { GetDocumentForIndexRetryQuery } from '../Queries/get-document-for-index-retry.query.ts'

export abstract class GetDocumentForIndexRetryQueryHandlerContract {
  abstract execute(getDocumentForIndexRetryDTO: GetDocumentForIndexRetryQuery): Promise<Document | null>
}
