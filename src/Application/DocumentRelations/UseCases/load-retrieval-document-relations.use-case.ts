import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import type { DocumentRelationRepository } from '../Contracts/document-relation.repository.ts'
import { LoadRetrievalDocumentRelationsUseCaseContract } from '../Contracts/load-retrieval-document-relations.use-case.contract.ts'
import type { LoadRetrievalDocumentRelationsDTO } from '../DataTransferObjects/load-retrieval-document-relations.dto.ts'
import { DocumentRelationInputGuard } from '../Guards/document-relation-input.guard.ts'

/** Publishes only the facts in this feature's requested retrieval scope. */
export class LoadRetrievalDocumentRelationsUseCase extends LoadRetrievalDocumentRelationsUseCaseContract {
  constructor(private readonly documentRelationRepository: DocumentRelationRepository) {
    super()
  }

  async execute(loadRetrievalDocumentRelationsDTO: LoadRetrievalDocumentRelationsDTO): Promise<DocumentRelation[]> {
    DocumentRelationInputGuard.assertObject(loadRetrievalDocumentRelationsDTO)
    DocumentRelationInputGuard.assertIdentifierList(
      loadRetrievalDocumentRelationsDTO.documentIndexIds,
      'documentIndexIds',
    )

    const { documentIndexIds } = loadRetrievalDocumentRelationsDTO
    const uniqueRetrievalSourceDocumentIndexIds = [...new Set(documentIndexIds)]

    if (uniqueRetrievalSourceDocumentIndexIds.length === 0) return []

    const retrievalScopeQO = { sourceIndexIds: uniqueRetrievalSourceDocumentIndexIds }
    const retrievalScopeDocumentRelations =
      await this.documentRelationRepository.findBySourceIndexIdsOrderByIdAsc(retrievalScopeQO)

    return retrievalScopeDocumentRelations.filter((retrievalDocumentRelation) =>
      uniqueRetrievalSourceDocumentIndexIds.includes(retrievalDocumentRelation.sourceIndexId),
    )
  }
}
