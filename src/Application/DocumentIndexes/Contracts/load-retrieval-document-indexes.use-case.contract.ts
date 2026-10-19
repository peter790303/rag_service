import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { LoadRetrievalDocumentIndexesDTO } from '../DataTransferObjects/load-retrieval-document-indexes.dto.ts'

export abstract class LoadRetrievalDocumentIndexesUseCaseContract {
  abstract execute(loadRetrievalDocumentIndexesDTO: LoadRetrievalDocumentIndexesDTO): Promise<DocumentIndex[]>
}
