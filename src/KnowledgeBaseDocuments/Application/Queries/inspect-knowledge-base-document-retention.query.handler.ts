import type { InspectKnowledgeBaseDocumentRetentionQuery } from './inspect-knowledge-base-document-retention.query.ts'
import type { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import { RetentionKnowledgeBaseDocumentAssembler } from '../Assemblers/retention-knowledge-base-document.assembler.ts'
import type { InspectKnowledgeBaseDocumentRetentionQueryHandlerContract } from '../Contracts/inspect-knowledge-base-document-retention.query.handler.contract.ts'
import { InvalidKnowledgeBaseDocumentInputException } from '../Exceptions/invalid-knowledge-base-document-input.exception.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'
import type { KnowledgeBaseDocumentRepository } from '../Ports/Out/Repositories/knowledge-base-document.repository.ts'

export class InspectKnowledgeBaseDocumentRetentionQueryHandler implements InspectKnowledgeBaseDocumentRetentionQueryHandlerContract {
  constructor(private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository) {}

  async execute(
    inspectKnowledgeBaseDocumentRetentionQuery: InspectKnowledgeBaseDocumentRetentionQuery,
  ): Promise<KnowledgeBaseDocument | null> {
    KnowledgeBaseDocumentInputGuard.assertObject(inspectKnowledgeBaseDocumentRetentionQuery)

    if ('documentId' in inspectKnowledgeBaseDocumentRetentionQuery) {
      if ('documentIndexId' in inspectKnowledgeBaseDocumentRetentionQuery)
        throw new InvalidKnowledgeBaseDocumentInputException('oneRetentionScope')

      const { documentId } = inspectKnowledgeBaseDocumentRetentionQuery

      if (typeof documentId !== 'string' || !documentId.trim())
        throw new InvalidKnowledgeBaseDocumentInputException('documentId')

      return this.knowledgeBaseDocumentRepository.findByDocumentId(
        RetentionKnowledgeBaseDocumentAssembler.toKnowledgeBaseDocumentDocumentQO(documentId),
      )
    }

    if ('documentIndexId' in inspectKnowledgeBaseDocumentRetentionQuery) {
      const { documentIndexId } = inspectKnowledgeBaseDocumentRetentionQuery

      if (typeof documentIndexId !== 'string' || !documentIndexId.trim())
        throw new InvalidKnowledgeBaseDocumentInputException('documentIndexId')

      return this.knowledgeBaseDocumentRepository.findByActiveDocumentIndexId(
        RetentionKnowledgeBaseDocumentAssembler.toKnowledgeBaseDocumentActiveIndexQO(documentIndexId),
      )
    }

    throw new InvalidKnowledgeBaseDocumentInputException('retentionScope')
  }
}
