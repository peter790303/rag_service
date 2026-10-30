import type { ReserveKnowledgeBaseDocumentForIndexingCommand } from './reserve-knowledge-base-document-for-indexing.command.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../../DocumentIndexes/Application/Exceptions/invalid-document-index-execution-lease.exception.ts'
import type { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import type { ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract } from '../Contracts/reserve-knowledge-base-document-for-indexing.command.handler.contract.ts'
import { InvalidKnowledgeBaseDocumentInputException } from '../Exceptions/invalid-knowledge-base-document-input.exception.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'
import type { KnowledgeBaseDocumentRepository } from '../Ports/Out/Repositories/knowledge-base-document.repository.ts'

/** Fences a lease by requested generation and distinguishes contention from detached knowledgeBaseDocument. */
export class ReserveKnowledgeBaseDocumentForIndexingCommandHandler implements ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract {
  constructor(private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository) {}

  async execute(
    reserveKnowledgeBaseDocumentForIndexingCommand: ReserveKnowledgeBaseDocumentForIndexingCommand,
  ): Promise<KnowledgeBaseDocument | null> {
    KnowledgeBaseDocumentInputGuard.assertObject(reserveKnowledgeBaseDocumentForIndexingCommand)
    KnowledgeBaseDocumentInputGuard.assertSource(
      reserveKnowledgeBaseDocumentForIndexingCommand.knowledgeBaseId,
      reserveKnowledgeBaseDocumentForIndexingCommand.documentId,
    )

    if (
      reserveKnowledgeBaseDocumentForIndexingCommand.skipLocked !== undefined &&
      typeof reserveKnowledgeBaseDocumentForIndexingCommand.skipLocked !== 'boolean'
    ) {
      throw new InvalidKnowledgeBaseDocumentInputException('skipLocked')
    }

    const knowledgeBaseDocumentSourceQO = {
      knowledgeBaseId: reserveKnowledgeBaseDocumentForIndexingCommand.knowledgeBaseId,
      documentId: reserveKnowledgeBaseDocumentForIndexingCommand.documentId,
    }
    const knowledgeBaseDocument = reserveKnowledgeBaseDocumentForIndexingCommand.skipLocked
      ? await this.knowledgeBaseDocumentRepository.lockByKnowledgeBaseIdAndDocumentIdSkipLocked(
          knowledgeBaseDocumentSourceQO,
        )
      : await this.knowledgeBaseDocumentRepository.lockByKnowledgeBaseIdAndDocumentId(knowledgeBaseDocumentSourceQO)

    if (reserveKnowledgeBaseDocumentForIndexingCommand.skipLocked && knowledgeBaseDocument === null) {
      const contendedKnowledgeBaseDocument =
        await this.knowledgeBaseDocumentRepository.findByKnowledgeBaseIdAndDocumentId(knowledgeBaseDocumentSourceQO)

      if (contendedKnowledgeBaseDocument !== null) {
        contendedKnowledgeBaseDocument.recordIndexingReservationLock(false)

        return contendedKnowledgeBaseDocument
      }
    }

    if (
      reserveKnowledgeBaseDocumentForIndexingCommand.generation !== undefined &&
      knowledgeBaseDocument?.requestedGeneration !== reserveKnowledgeBaseDocumentForIndexingCommand.generation
    ) {
      throw new InvalidDocumentIndexExecutionLeaseException()
    }

    knowledgeBaseDocument?.recordIndexingReservationLock(true)

    return knowledgeBaseDocument
  }
}
