import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { LoadRetrievalDocumentRevisionsDto } from '../DataTransferObjects/load-retrieval-document-revisions.dto.ts'

export abstract class LoadRetrievalDocumentRevisionsUseCaseContract {
  abstract execute(loadRetrievalDocumentRevisionsDTO: LoadRetrievalDocumentRevisionsDto): Promise<DocumentRevision[]>
}
