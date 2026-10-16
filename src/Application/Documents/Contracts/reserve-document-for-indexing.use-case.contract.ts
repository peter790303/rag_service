import type { Document } from '../../../Domain/Document/document.ts'

export abstract class ReserveDocumentForIndexingUseCaseContract {
  abstract execute(reserveDocumentForIndexingDTO: {
    documentId: string
    skipLocked?: boolean
  }): Promise<Document | null>
}
