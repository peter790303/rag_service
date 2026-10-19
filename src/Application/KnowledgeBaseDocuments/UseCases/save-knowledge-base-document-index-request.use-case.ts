import { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import { IndexingKnowledgeBaseDocumentAssembler } from '../Assemblers/indexing-knowledge-base-document.assembler.ts'
import type { KnowledgeBaseDocumentRepository } from '../Contracts/knowledge-base-document.repository.ts'
import type { SaveKnowledgeBaseDocumentIndexRequestUseCaseContract } from '../Contracts/save-knowledge-base-document-index-request.use-case.contract.ts'
import type { SaveKnowledgeBaseDocumentIndexRequestDTO } from '../DataTransferObjects/save-knowledge-base-document-index-request.dto.ts'
import { InvalidKnowledgeBaseDocumentInputException } from '../Exceptions/invalid-knowledge-base-document-input.exception.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'

/** Records the target generation chosen while the request holds the knowledgeBaseDocument lock. */
export class SaveKnowledgeBaseDocumentIndexRequestUseCase implements SaveKnowledgeBaseDocumentIndexRequestUseCaseContract {
  constructor(private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository) {}

  async execute(saveKnowledgeBaseDocumentIndexRequestDTO: SaveKnowledgeBaseDocumentIndexRequestDTO): Promise<void> {
    KnowledgeBaseDocumentInputGuard.assertObject(saveKnowledgeBaseDocumentIndexRequestDTO)

    if (!(saveKnowledgeBaseDocumentIndexRequestDTO.knowledgeBaseDocument instanceof KnowledgeBaseDocument)) {
      throw new InvalidKnowledgeBaseDocumentInputException('knowledgeBaseDocument')
    }

    const requestedKnowledgeBaseDocument = saveKnowledgeBaseDocumentIndexRequestDTO.knowledgeBaseDocument.requestIndex(
      {
        generation: saveKnowledgeBaseDocumentIndexRequestDTO.generation,
        activeDocumentIndexId: saveKnowledgeBaseDocumentIndexRequestDTO.activeDocumentIndexId,
      },
      new Date(),
    )
    const updateKnowledgeBaseDocumentQO =
      IndexingKnowledgeBaseDocumentAssembler.toUpdateKnowledgeBaseDocumentQO(requestedKnowledgeBaseDocument)
    await this.knowledgeBaseDocumentRepository.updateByKnowledgeBaseIdAndDocumentId(updateKnowledgeBaseDocumentQO)
  }
}
