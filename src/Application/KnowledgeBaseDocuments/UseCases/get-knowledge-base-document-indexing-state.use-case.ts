import type { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import type { GetKnowledgeBaseDocumentIndexingStateUseCaseContract } from '../Contracts/get-knowledge-base-document-indexing-state.use-case.contract.ts'
import type { KnowledgeBaseDocumentRepository } from '../Contracts/knowledge-base-document.repository.ts'
import type { GetKnowledgeBaseDocumentIndexingStateDTO } from '../DataTransferObjects/get-knowledge-base-document-indexing-state.dto.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'

/** Exposes the requested and active targets for indexing status and retry decisions. */
export class GetKnowledgeBaseDocumentIndexingStateUseCase implements GetKnowledgeBaseDocumentIndexingStateUseCaseContract {
  constructor(private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository) {}

  async execute(
    getKnowledgeBaseDocumentIndexingStateDTO: GetKnowledgeBaseDocumentIndexingStateDTO,
  ): Promise<KnowledgeBaseDocument | null> {
    KnowledgeBaseDocumentInputGuard.assertObject(getKnowledgeBaseDocumentIndexingStateDTO)
    KnowledgeBaseDocumentInputGuard.assertSource(
      getKnowledgeBaseDocumentIndexingStateDTO.knowledgeBaseId,
      getKnowledgeBaseDocumentIndexingStateDTO.documentId,
    )

    const knowledgeBaseDocumentSourceQO = {
      knowledgeBaseId: getKnowledgeBaseDocumentIndexingStateDTO.knowledgeBaseId,
      documentId: getKnowledgeBaseDocumentIndexingStateDTO.documentId,
    }
    const knowledgeBaseDocument =
      await this.knowledgeBaseDocumentRepository.findByKnowledgeBaseIdAndDocumentId(knowledgeBaseDocumentSourceQO)

    return knowledgeBaseDocument
  }
}
