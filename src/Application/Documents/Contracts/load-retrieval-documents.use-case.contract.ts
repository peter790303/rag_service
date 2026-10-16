import type { Document } from '../../../Domain/Document/document.ts'
import type { LoadRetrievalDocumentsDto } from '../DataTransferObjects/load-retrieval-documents.dto.ts'

export abstract class LoadRetrievalDocumentsUseCaseContract {
  abstract execute(loadRetrievalDocumentsDTO: LoadRetrievalDocumentsDto): Promise<Document[]>
}
