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
    activateKnowledgeBaseDocumentIndexCommand: ActivateKnowledgeBaseDocumentIndexCommand,
  ): Promise<KnowledgeBaseDocument | null> {
    KnowledgeBaseDocumentInputGuard.assertObject(activateKnowledgeBaseDocumentIndexCommand)
    KnowledgeBaseDocumentInputGuard.assertSource(
      activateKnowledgeBaseDocumentIndexCommand.knowledgeBaseId,
      activateKnowledgeBaseDocumentIndexCommand.documentId,
    )
    KnowledgeBaseDocumentInputGuard.assertActivation(
      activateKnowledgeBaseDocumentIndexCommand.generation,
      activateKnowledgeBaseDocumentIndexCommand.expectedActiveDocumentIndexId,
      activateKnowledgeBaseDocumentIndexCommand.documentIndexId,
    )

    const knowledgeBaseDocumentSourceQO = {
      knowledgeBaseId: activateKnowledgeBaseDocumentIndexCommand.knowledgeBaseId,
      documentId: activateKnowledgeBaseDocumentIndexCommand.documentId,
    }
    const knowledgeBaseDocument =
      await this.knowledgeBaseDocumentRepository.findByKnowledgeBaseIdAndDocumentId(knowledgeBaseDocumentSourceQO)

    if (
      knowledgeBaseDocument === null ||
      knowledgeBaseDocument.requestedGeneration !== activateKnowledgeBaseDocumentIndexCommand.generation ||
      knowledgeBaseDocument.activeDocumentIndexId !==
        activateKnowledgeBaseDocumentIndexCommand.expectedActiveDocumentIndexId
    )
      return null

    const activatedKnowledgeBaseDocument = knowledgeBaseDocument.activateIndex(
      activateKnowledgeBaseDocumentIndexCommand.documentIndexId,
      new Date(),
    )
    const knowledgeBaseDocumentActivationQO =
      IndexingKnowledgeBaseDocumentAssembler.toKnowledgeBaseDocumentActivationQO(
        activatedKnowledgeBaseDocument,
        activateKnowledgeBaseDocumentIndexCommand.expectedActiveDocumentIndexId,
        activateKnowledgeBaseDocumentIndexCommand.documentIndexId,
      )

    return this.knowledgeBaseDocumentRepository.updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId(
      knowledgeBaseDocumentActivationQO,
    )
  }
}
