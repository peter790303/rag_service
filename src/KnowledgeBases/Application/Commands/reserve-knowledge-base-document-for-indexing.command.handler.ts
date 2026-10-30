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
    reserveKnowledgeBaseDocumentForIndexingDTO: ReserveKnowledgeBaseDocumentForIndexingCommand,
  ): Promise<KnowledgeBaseDocument | null> {
    KnowledgeBaseDocumentInputGuard.assertObject(reserveKnowledgeBaseDocumentForIndexingDTO)
    KnowledgeBaseDocumentInputGuard.assertSource(
      reserveKnowledgeBaseDocumentForIndexingDTO.knowledgeBaseId,
      reserveKnowledgeBaseDocumentForIndexingDTO.documentId,
    )

    if (
      reserveKnowledgeBaseDocumentForIndexingDTO.skipLocked !== undefined &&
      typeof reserveKnowledgeBaseDocumentForIndexingDTO.skipLocked !== 'boolean'
    ) {
      throw new InvalidKnowledgeBaseDocumentInputException('skipLocked')
    }

    const knowledgeBaseDocumentSourceQO = {
      knowledgeBaseId: reserveKnowledgeBaseDocumentForIndexingDTO.knowledgeBaseId,
      documentId: reserveKnowledgeBaseDocumentForIndexingDTO.documentId,
    }
    const knowledgeBaseDocument = reserveKnowledgeBaseDocumentForIndexingDTO.skipLocked
      ? await this.knowledgeBaseDocumentRepository.lockByKnowledgeBaseIdAndDocumentIdSkipLocked(
          knowledgeBaseDocumentSourceQO,
        )
      : await this.knowledgeBaseDocumentRepository.lockByKnowledgeBaseIdAndDocumentId(knowledgeBaseDocumentSourceQO)

    if (reserveKnowledgeBaseDocumentForIndexingDTO.skipLocked && knowledgeBaseDocument === null) {
      const contendedKnowledgeBaseDocument =
        await this.knowledgeBaseDocumentRepository.findByKnowledgeBaseIdAndDocumentId(knowledgeBaseDocumentSourceQO)

      if (contendedKnowledgeBaseDocument !== null) {
        contendedKnowledgeBaseDocument.recordIndexingReservationLock(false)

        return contendedKnowledgeBaseDocument
      }
    }

    if (
      reserveKnowledgeBaseDocumentForIndexingDTO.generation !== undefined &&
      knowledgeBaseDocument?.requestedGeneration !== reserveKnowledgeBaseDocumentForIndexingDTO.generation
    ) {
      throw new InvalidDocumentIndexExecutionLeaseException()
    }

    knowledgeBaseDocument?.recordIndexingReservationLock(true)

    return knowledgeBaseDocument
  }
}
