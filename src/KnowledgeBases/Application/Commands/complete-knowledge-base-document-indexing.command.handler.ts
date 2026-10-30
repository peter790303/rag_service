import type { CompleteKnowledgeBaseDocumentIndexingCommand } from './complete-knowledge-base-document-indexing.command.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../../DocumentIndexes/Application/Exceptions/invalid-document-index-execution-lease.exception.ts'
import { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import { IndexingKnowledgeBaseDocumentAssembler } from '../Assemblers/indexing-knowledge-base-document.assembler.ts'
import type { CompleteKnowledgeBaseDocumentIndexingCommandHandlerContract } from '../Contracts/complete-knowledge-base-document-indexing.command.handler.contract.ts'
import { InvalidKnowledgeBaseDocumentInputException } from '../Exceptions/invalid-knowledge-base-document-input.exception.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'
import type { KnowledgeBaseDocumentRepository } from '../Ports/Out/Repositories/knowledge-base-document.repository.ts'

/** Publishes the completed target only for the reserved generation and prior active target. */
export class CompleteKnowledgeBaseDocumentIndexingCommandHandler implements CompleteKnowledgeBaseDocumentIndexingCommandHandlerContract {
  constructor(private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository) {}

  async execute(completeKnowledgeBaseDocumentIndexingDTO: CompleteKnowledgeBaseDocumentIndexingCommand): Promise<void> {
    KnowledgeBaseDocumentInputGuard.assertObject(completeKnowledgeBaseDocumentIndexingDTO)

    if (!(completeKnowledgeBaseDocumentIndexingDTO.knowledgeBaseDocument instanceof KnowledgeBaseDocument)) {
      throw new InvalidKnowledgeBaseDocumentInputException('knowledgeBaseDocument')
    }

    if (
      completeKnowledgeBaseDocumentIndexingDTO.knowledgeBaseDocument.requestedGeneration !==
      completeKnowledgeBaseDocumentIndexingDTO.generation
    )
      throw new InvalidDocumentIndexExecutionLeaseException()

    const activatedKnowledgeBaseDocument = completeKnowledgeBaseDocumentIndexingDTO.knowledgeBaseDocument.activateIndex(
      completeKnowledgeBaseDocumentIndexingDTO.documentIndexId,
      new Date(),
    )
    const knowledgeBaseDocumentActivationQO =
      IndexingKnowledgeBaseDocumentAssembler.toKnowledgeBaseDocumentActivationQO(
        activatedKnowledgeBaseDocument,
        completeKnowledgeBaseDocumentIndexingDTO.knowledgeBaseDocument.activeDocumentIndexId,
        completeKnowledgeBaseDocumentIndexingDTO.documentIndexId,
      )
    const activated =
      await this.knowledgeBaseDocumentRepository.updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId(
        knowledgeBaseDocumentActivationQO,
      )

    if (activated === null) throw new InvalidDocumentIndexExecutionLeaseException()
  }
}
