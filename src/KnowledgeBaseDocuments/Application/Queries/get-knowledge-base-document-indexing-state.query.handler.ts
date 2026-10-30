import type { GetKnowledgeBaseDocumentIndexingStateQuery } from './get-knowledge-base-document-indexing-state.query.ts'
import type { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import type { GetKnowledgeBaseDocumentIndexingStateQueryHandlerContract } from '../Contracts/get-knowledge-base-document-indexing-state.query.handler.contract.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'
import type { KnowledgeBaseDocumentRepository } from '../Ports/Out/Repositories/knowledge-base-document.repository.ts'

/** Exposes the requested and active targets for indexing status and retry decisions. */
export class GetKnowledgeBaseDocumentIndexingStateQueryHandler implements GetKnowledgeBaseDocumentIndexingStateQueryHandlerContract {
  constructor(private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository) {}

  async execute(
    getKnowledgeBaseDocumentIndexingStateQuery: GetKnowledgeBaseDocumentIndexingStateQuery,
  ): Promise<KnowledgeBaseDocument | null> {
    KnowledgeBaseDocumentInputGuard.assertObject(getKnowledgeBaseDocumentIndexingStateQuery)
    KnowledgeBaseDocumentInputGuard.assertSource(
      getKnowledgeBaseDocumentIndexingStateQuery.knowledgeBaseId,
      getKnowledgeBaseDocumentIndexingStateQuery.documentId,
    )

    const knowledgeBaseDocumentSourceQO = {
      knowledgeBaseId: getKnowledgeBaseDocumentIndexingStateQuery.knowledgeBaseId,
      documentId: getKnowledgeBaseDocumentIndexingStateQuery.documentId,
    }
    const knowledgeBaseDocument =
      await this.knowledgeBaseDocumentRepository.findByKnowledgeBaseIdAndDocumentId(knowledgeBaseDocumentSourceQO)

    return knowledgeBaseDocument
  }
}
