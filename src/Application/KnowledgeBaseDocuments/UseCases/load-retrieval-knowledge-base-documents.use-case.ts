import type { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import type { KnowledgeBaseDocumentRepository } from '../Contracts/knowledge-base-document.repository.ts'
import { LoadRetrievalKnowledgeBaseDocumentsUseCaseContract } from '../Contracts/load-retrieval-knowledge-base-documents.use-case.contract.ts'
import type { LoadRetrievalKnowledgeBaseDocumentsDTO } from '../DataTransferObjects/load-retrieval-knowledge-base-documents.dto.ts'
import { InvalidKnowledgeBaseDocumentInputException } from '../Exceptions/invalid-knowledge-base-document-input.exception.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'

/** Publishes only the facts in this feature's requested retrieval scope. */
export class LoadRetrievalKnowledgeBaseDocumentsUseCase extends LoadRetrievalKnowledgeBaseDocumentsUseCaseContract {
  constructor(private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository) {
    super()
  }

  async execute(
    loadRetrievalKnowledgeBaseDocumentsDTO: LoadRetrievalKnowledgeBaseDocumentsDTO,
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
