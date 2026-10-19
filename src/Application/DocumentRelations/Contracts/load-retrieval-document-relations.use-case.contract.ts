import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import type { LoadRetrievalDocumentRelationsDTO } from '../DataTransferObjects/load-retrieval-document-relations.dto.ts'

export abstract class LoadRetrievalDocumentRelationsUseCaseContract {
  abstract execute(loadRetrievalDocumentRelationsDTO: LoadRetrievalDocumentRelationsDTO): Promise<DocumentRelation[]>
}
