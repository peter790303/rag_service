import type { Document } from '../../../Domain/Document/document.ts'

export abstract class GetDocumentForIndexRetryUseCaseContract {
  abstract execute(getDocumentForIndexRetryDTO: { documentId: string }): Promise<Document | null>
}
