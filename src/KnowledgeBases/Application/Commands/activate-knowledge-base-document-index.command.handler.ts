import type { ActivateKnowledgeBaseDocumentIndexCommand } from './activate-knowledge-base-document-index.command.ts'
import type { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import { IndexingKnowledgeBaseDocumentAssembler } from '../Assemblers/indexing-knowledge-base-document.assembler.ts'
import type { ActivateKnowledgeBaseDocumentIndexCommandHandlerContract } from '../Contracts/activate-knowledge-base-document-index.command.handler.contract.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'
import type { KnowledgeBaseDocumentRepository } from '../Ports/Out/Repositories/knowledge-base-document.repository.ts'

/** Activates a ready queued target only while both requested and active targets still match. */
export class ActivateKnowledgeBaseDocumentIndexCommandHandler implements ActivateKnowledgeBaseDocumentIndexCommandHandlerContract {
  constructor(private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository) {}

  async execute(
    activateKnowledgeBaseDocumentIndexDTO: ActivateKnowledgeBaseDocumentIndexCommand,
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
