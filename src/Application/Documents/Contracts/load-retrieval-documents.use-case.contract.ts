import type { Document } from '../../../Domain/Document/document.ts'
import type { LoadRetrievalDocumentsDTO } from '../DataTransferObjects/load-retrieval-documents.dto.ts'

export abstract class LoadRetrievalDocumentsUseCaseContract {
  abstract execute(loadRetrievalDocumentsDTO: LoadRetrievalDocumentsDTO): Promise<Document[]>
}
