import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { LoadRetrievalDocumentIndexesDto } from '../DataTransferObjects/load-retrieval-document-indexes.dto.ts'

export abstract class LoadRetrievalDocumentIndexesUseCaseContract {
  abstract execute(loadRetrievalDocumentIndexesDTO: LoadRetrievalDocumentIndexesDto): Promise<DocumentIndex[]>
}
