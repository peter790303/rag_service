import type { LoadRetrievalKnowledgeBaseDocumentsQuery } from './load-retrieval-knowledge-base-documents.query.ts'
import type { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import { LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract } from '../Contracts/load-retrieval-knowledge-base-documents.query.handler.contract.ts'
import { InvalidKnowledgeBaseDocumentInputException } from '../Exceptions/invalid-knowledge-base-document-input.exception.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'
import type { KnowledgeBaseDocumentRepository } from '../Ports/Out/Repositories/knowledge-base-document.repository.ts'

/** Publishes only the facts in this feature's requested retrieval scope. */
export class LoadRetrievalKnowledgeBaseDocumentsQueryHandler extends LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract {
  constructor(private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository) {
    super()
  }

  async execute(
    loadRetrievalKnowledgeBaseDocumentsDTO: LoadRetrievalKnowledgeBaseDocumentsQuery,
  ): Promise<KnowledgeBaseDocument[]> {
    KnowledgeBaseDocumentInputGuard.assertObject(loadRetrievalKnowledgeBaseDocumentsDTO)

    if (
      typeof loadRetrievalKnowledgeBaseDocumentsDTO.knowledgeBaseId !== 'string' ||
      !loadRetrievalKnowledgeBaseDocumentsDTO.knowledgeBaseId.trim()
    )
      throw new InvalidKnowledgeBaseDocumentInputException('knowledgeBaseId')

    const { knowledgeBaseId } = loadRetrievalKnowledgeBaseDocumentsDTO
    const knowledgeBaseDocumentQO = { knowledgeBaseId }
    const retrievalKnowledgeBaseDocuments =
      await this.knowledgeBaseDocumentRepository.findByKnowledgeBaseIdOrderByDocumentIdAsc(knowledgeBaseDocumentQO)

    return retrievalKnowledgeBaseDocuments
  }
}
