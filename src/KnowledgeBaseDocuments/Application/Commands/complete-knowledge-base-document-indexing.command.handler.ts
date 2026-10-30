import type { CompleteKnowledgeBaseDocumentIndexingCommand } from './complete-knowledge-base-document-indexing.command.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../../DocumentIndexes/Application/Exceptions/invalid-document-index-execution-lease.exception.ts'
import { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import { IndexingKnowledgeBaseDocumentAssembler } from '../Assemblers/indexing-knowledge-base-document.assembler.ts'
import type { CompleteKnowledgeBaseDocumentIndexingCommandHandlerContract } from '../Contracts/complete-knowledge-base-document-indexing.command.handler.contract.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'
import type { KnowledgeBaseDocumentRepository } from '../Ports/Out/Repositories/knowledge-base-document.repository.ts'

/** Publishes the completed target only for the reserved generation and prior active target. */
export class CompleteKnowledgeBaseDocumentIndexingCommandHandler implements CompleteKnowledgeBaseDocumentIndexingCommandHandlerContract {
  constructor(private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository) {}

  async execute(
    completeKnowledgeBaseDocumentIndexingCommand: CompleteKnowledgeBaseDocumentIndexingCommand,
  ): Promise<void> {
    KnowledgeBaseDocumentInputGuard.assertObject(completeKnowledgeBaseDocumentIndexingCommand)

    const knowledgeBaseDocument = new KnowledgeBaseDocument(
      completeKnowledgeBaseDocumentIndexingCommand.knowledgeBaseDocument,
    )

    if (knowledgeBaseDocument.requestedGeneration !== completeKnowledgeBaseDocumentIndexingCommand.generation)
      throw new InvalidDocumentIndexExecutionLeaseException()

    const activatedKnowledgeBaseDocument = knowledgeBaseDocument.activateIndex(
      completeKnowledgeBaseDocumentIndexingCommand.documentIndexId,
      new Date(),
    )
    const knowledgeBaseDocumentActivationQO =
      IndexingKnowledgeBaseDocumentAssembler.toKnowledgeBaseDocumentActivationQO(
        activatedKnowledgeBaseDocument,
        knowledgeBaseDocument.activeDocumentIndexId,
        completeKnowledgeBaseDocumentIndexingCommand.documentIndexId,
      )
    const activated =
      await this.knowledgeBaseDocumentRepository.updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId(
        knowledgeBaseDocumentActivationQO,
      )

    if (activated === null) throw new InvalidDocumentIndexExecutionLeaseException()
  }
}
