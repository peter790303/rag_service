import type { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import { IndexingKnowledgeBaseDocumentAssembler } from '../Assemblers/indexing-knowledge-base-document.assembler.ts'
import type { ActivateKnowledgeBaseDocumentIndexUseCaseContract } from '../Contracts/activate-knowledge-base-document-index.use-case.contract.ts'
import type { KnowledgeBaseDocumentRepository } from '../Contracts/knowledge-base-document.repository.ts'
import type { ActivateKnowledgeBaseDocumentIndexDTO } from '../DataTransferObjects/activate-knowledge-base-document-index.dto.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'

/** Activates a ready queued target only while both requested and active targets still match. */
export class ActivateKnowledgeBaseDocumentIndexUseCase implements ActivateKnowledgeBaseDocumentIndexUseCaseContract {
  constructor(private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository) {}

  async execute(
    activateKnowledgeBaseDocumentIndexDTO: ActivateKnowledgeBaseDocumentIndexDTO,
  ): Promise<KnowledgeBaseDocument | null> {
    KnowledgeBaseDocumentInputGuard.assertObject(activateKnowledgeBaseDocumentIndexDTO)
    KnowledgeBaseDocumentInputGuard.assertSource(
      activateKnowledgeBaseDocumentIndexDTO.knowledgeBaseId,
      activateKnowledgeBaseDocumentIndexDTO.documentId,
    )
    KnowledgeBaseDocumentInputGuard.assertActivation(
      activateKnowledgeBaseDocumentIndexDTO.generation,
      activateKnowledgeBaseDocumentIndexDTO.expectedActiveDocumentIndexId,
      activateKnowledgeBaseDocumentIndexDTO.documentIndexId,
    )

    const knowledgeBaseDocumentSourceQO = {
      knowledgeBaseId: activateKnowledgeBaseDocumentIndexDTO.knowledgeBaseId,
      documentId: activateKnowledgeBaseDocumentIndexDTO.documentId,
    }
    const knowledgeBaseDocument =
      await this.knowledgeBaseDocumentRepository.findByKnowledgeBaseIdAndDocumentId(knowledgeBaseDocumentSourceQO)

    if (
      knowledgeBaseDocument === null ||
      knowledgeBaseDocument.requestedGeneration !== activateKnowledgeBaseDocumentIndexDTO.generation ||
      knowledgeBaseDocument.activeDocumentIndexId !==
        activateKnowledgeBaseDocumentIndexDTO.expectedActiveDocumentIndexId
    )
      return null

    const activatedKnowledgeBaseDocument = knowledgeBaseDocument.activateIndex(
      activateKnowledgeBaseDocumentIndexDTO.documentIndexId,
      new Date(),
    )
    const knowledgeBaseDocumentActivationQO =
      IndexingKnowledgeBaseDocumentAssembler.toKnowledgeBaseDocumentActivationQO(
        activatedKnowledgeBaseDocument,
        activateKnowledgeBaseDocumentIndexDTO.expectedActiveDocumentIndexId,
        activateKnowledgeBaseDocumentIndexDTO.documentIndexId,
      )

    return this.knowledgeBaseDocumentRepository.updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId(
      knowledgeBaseDocumentActivationQO,
    )
  }
}
