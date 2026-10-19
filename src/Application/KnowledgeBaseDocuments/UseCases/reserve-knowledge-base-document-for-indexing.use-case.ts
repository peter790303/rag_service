import type { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../DocumentIndexes/Exceptions/invalid-document-index-execution-lease.exception.ts'
import type { KnowledgeBaseDocumentRepository } from '../Contracts/knowledge-base-document.repository.ts'
import type { ReserveKnowledgeBaseDocumentForIndexingUseCaseContract } from '../Contracts/reserve-knowledge-base-document-for-indexing.use-case.contract.ts'
import type { ReserveKnowledgeBaseDocumentForIndexingDTO } from '../DataTransferObjects/reserve-knowledge-base-document-for-indexing.dto.ts'
import { InvalidKnowledgeBaseDocumentInputException } from '../Exceptions/invalid-knowledge-base-document-input.exception.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'

/** Fences a lease by requested generation and distinguishes contention from detached knowledgeBaseDocument. */
export class ReserveKnowledgeBaseDocumentForIndexingUseCase implements ReserveKnowledgeBaseDocumentForIndexingUseCaseContract {
  constructor(private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository) {}

  async execute(
    reserveKnowledgeBaseDocumentForIndexingDTO: ReserveKnowledgeBaseDocumentForIndexingDTO,
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
