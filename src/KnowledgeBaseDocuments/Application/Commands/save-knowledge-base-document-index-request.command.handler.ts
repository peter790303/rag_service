import type { SaveKnowledgeBaseDocumentIndexRequestCommand } from './save-knowledge-base-document-index-request.command.ts'
import { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import { IndexingKnowledgeBaseDocumentAssembler } from '../Assemblers/indexing-knowledge-base-document.assembler.ts'
import type { SaveKnowledgeBaseDocumentIndexRequestCommandHandlerContract } from '../Contracts/save-knowledge-base-document-index-request.command.handler.contract.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'
import type { KnowledgeBaseDocumentRepository } from '../Ports/Out/Repositories/knowledge-base-document.repository.ts'

/** Records the target generation chosen while the request holds the knowledgeBaseDocument lock. */
export class SaveKnowledgeBaseDocumentIndexRequestCommandHandler implements SaveKnowledgeBaseDocumentIndexRequestCommandHandlerContract {
  constructor(private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository) {}

  async execute(
    saveKnowledgeBaseDocumentIndexRequestCommand: SaveKnowledgeBaseDocumentIndexRequestCommand,
  ): Promise<void> {
    KnowledgeBaseDocumentInputGuard.assertObject(saveKnowledgeBaseDocumentIndexRequestCommand)

    const knowledgeBaseDocument = new KnowledgeBaseDocument(
      saveKnowledgeBaseDocumentIndexRequestCommand.knowledgeBaseDocument,
    )

    const requestedKnowledgeBaseDocument = knowledgeBaseDocument.requestIndex(
      {
        generation: saveKnowledgeBaseDocumentIndexRequestCommand.generation,
        activeDocumentIndexId: saveKnowledgeBaseDocumentIndexRequestCommand.activeDocumentIndexId,
      },
      new Date(),
    )
    const updateKnowledgeBaseDocumentQO =
      IndexingKnowledgeBaseDocumentAssembler.toUpdateKnowledgeBaseDocumentQO(requestedKnowledgeBaseDocument)
    await this.knowledgeBaseDocumentRepository.updateByKnowledgeBaseIdAndDocumentId(updateKnowledgeBaseDocumentQO)
  }
}
