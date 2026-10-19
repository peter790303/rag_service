import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { LoadRetrievalDocumentRevisionsDTO } from '../DataTransferObjects/load-retrieval-document-revisions.dto.ts'

export abstract class LoadRetrievalDocumentRevisionsUseCaseContract {
  abstract execute(loadRetrievalDocumentRevisionsDTO: LoadRetrievalDocumentRevisionsDTO): Promise<DocumentRevision[]>
}
