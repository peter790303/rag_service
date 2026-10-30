import type { LoadRetrievalDocumentRelationsQuery } from './load-retrieval-document-relations.query.ts'
import type { DocumentRelation } from '../../Domain/Entities/document-relation.ts'
import { LoadRetrievalDocumentRelationsQueryHandlerContract } from '../Contracts/load-retrieval-document-relations.query.handler.contract.ts'
import { DocumentRelationInputGuard } from '../Guards/document-relation-input.guard.ts'
import type { DocumentRelationRepository } from '../Ports/Out/Repositories/document-relation.repository.ts'

/** Publishes only the facts in this feature's requested retrieval scope. */
export class LoadRetrievalDocumentRelationsQueryHandler extends LoadRetrievalDocumentRelationsQueryHandlerContract {
  constructor(private readonly documentRelationRepository: DocumentRelationRepository) {
    super()
  }

  async execute(loadRetrievalDocumentRelationsDTO: LoadRetrievalDocumentRelationsQuery): Promise<DocumentRelation[]> {
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
