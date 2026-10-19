import { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../DocumentIndexes/Exceptions/invalid-document-index-execution-lease.exception.ts'
import { IndexingKnowledgeBaseDocumentAssembler } from '../Assemblers/indexing-knowledge-base-document.assembler.ts'
import type { CompleteKnowledgeBaseDocumentIndexingUseCaseContract } from '../Contracts/complete-knowledge-base-document-indexing.use-case.contract.ts'
import type { KnowledgeBaseDocumentRepository } from '../Contracts/knowledge-base-document.repository.ts'
import type { CompleteKnowledgeBaseDocumentIndexingDTO } from '../DataTransferObjects/complete-knowledge-base-document-indexing.dto.ts'
import { InvalidKnowledgeBaseDocumentInputException } from '../Exceptions/invalid-knowledge-base-document-input.exception.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'

/** Publishes the completed target only for the reserved generation and prior active target. */
export class CompleteKnowledgeBaseDocumentIndexingUseCase implements CompleteKnowledgeBaseDocumentIndexingUseCaseContract {
  constructor(private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository) {}

  async execute(completeKnowledgeBaseDocumentIndexingDTO: CompleteKnowledgeBaseDocumentIndexingDTO): Promise<void> {
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
