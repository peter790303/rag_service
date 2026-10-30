import type { Document } from '../../Domain/Entities/document.ts'
import type { LoadRetrievalDocumentsQuery } from '../Queries/load-retrieval-documents.query.ts'

export abstract class LoadRetrievalDocumentsQueryHandlerContract {
  abstract execute(loadRetrievalDocumentsDTO: LoadRetrievalDocumentsQuery): Promise<Document[]>
}
