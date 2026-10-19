import type { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import { RetentionKnowledgeBaseDocumentAssembler } from '../Assemblers/retention-knowledge-base-document.assembler.ts'
import type { InspectKnowledgeBaseDocumentRetentionUseCaseContract } from '../Contracts/inspect-knowledge-base-document-retention.use-case.contract.ts'
import type { KnowledgeBaseDocumentRepository } from '../Contracts/knowledge-base-document.repository.ts'
import type { KnowledgeBaseDocumentRetentionDTO } from '../DataTransferObjects/knowledge-base-document-retention.dto.ts'
import { InvalidKnowledgeBaseDocumentInputException } from '../Exceptions/invalid-knowledge-base-document-input.exception.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'

export class InspectKnowledgeBaseDocumentRetentionUseCase implements InspectKnowledgeBaseDocumentRetentionUseCaseContract {
  constructor(private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository) {}

  async execute(
    inspectKnowledgeBaseDocumentRetentionDTO: KnowledgeBaseDocumentRetentionDTO,
  ): Promise<KnowledgeBaseDocument | null> {
    KnowledgeBaseDocumentInputGuard.assertObject(inspectKnowledgeBaseDocumentRetentionDTO)

    if ('documentId' in inspectKnowledgeBaseDocumentRetentionDTO) {
      if ('documentIndexId' in inspectKnowledgeBaseDocumentRetentionDTO)
        throw new InvalidKnowledgeBaseDocumentInputException('oneRetentionScope')

      const { documentId } = inspectKnowledgeBaseDocumentRetentionDTO

      if (typeof documentId !== 'string' || !documentId.trim())
        throw new InvalidKnowledgeBaseDocumentInputException('documentId')

      return this.knowledgeBaseDocumentRepository.findByDocumentId(
        RetentionKnowledgeBaseDocumentAssembler.toKnowledgeBaseDocumentDocumentQO(documentId),
      )
    }

    if ('documentIndexId' in inspectKnowledgeBaseDocumentRetentionDTO) {
      const { documentIndexId } = inspectKnowledgeBaseDocumentRetentionDTO

      if (typeof documentIndexId !== 'string' || !documentIndexId.trim())
        throw new InvalidKnowledgeBaseDocumentInputException('documentIndexId')

      return this.knowledgeBaseDocumentRepository.findByActiveDocumentIndexId(
        RetentionKnowledgeBaseDocumentAssembler.toKnowledgeBaseDocumentActiveIndexQO(documentIndexId),
      )
    }

    throw new InvalidKnowledgeBaseDocumentInputException('retentionScope')
  }
}
