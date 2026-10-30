import { FindRetrievalChunkCandidatesQueryHandlerContract } from '../../../../Chunks/Application/Contracts/find-retrieval-chunk-candidates.query.handler.contract.ts'
import { LoadRetrievalChunkContextQueryHandlerContract } from '../../../../Chunks/Application/Contracts/load-retrieval-chunk-context.query.handler.contract.ts'
import { LoadRetrievalIndexChunksQueryHandlerContract } from '../../../../Chunks/Application/Contracts/load-retrieval-index-chunks.query.handler.contract.ts'
import { LoadRetrievalDocumentIndexesQueryHandlerContract } from '../../../../DocumentIndexes/Application/Contracts/load-retrieval-document-indexes.query.handler.contract.ts'
import { DOCUMENT_INDEX_PIPELINE_SETTINGS } from '../../../../DocumentIndexes/Infrastructure/Nest/Providers/indexing-profiles.providers.ts'
import { LoadRetrievalDocumentRelationsQueryHandlerContract } from '../../../../DocumentRelations/Application/Contracts/load-retrieval-document-relations.query.handler.contract.ts'
import { LoadRetrievalDocumentRevisionsQueryHandlerContract } from '../../../../DocumentRevisions/Application/Contracts/load-retrieval-document-revisions.query.handler.contract.ts'
import { LoadRetrievalDocumentsQueryHandlerContract } from '../../../../Documents/Application/Contracts/load-retrieval-documents.query.handler.contract.ts'
import { LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract } from '../../../../KnowledgeBaseDocuments/Application/Contracts/load-retrieval-knowledge-base-documents.query.handler.contract.ts'
import { EmbeddingProvider } from '../../../../Shared/Application/Ports/Out/Gateways/embedding-provider.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'
import { RetrievalProfileSettingsDTO } from '../../../Application/DataTransferObjects/retrieval-profile-settings.dto.ts'
import { KnowledgeBaseRepository as KnowledgeBaseRepositoryContract } from '../../../Application/Ports/Out/Repositories/knowledge-base.repository.ts'
import { RetrieveKnowledgeBaseContentQueryHandler } from '../../../Application/Queries/retrieve-knowledge-base-content.query.handler.ts'

export const knowledgeBaseRetrievalProviders = [
  {
    provide: RetrieveKnowledgeBaseContentQueryHandler,
    useFactory: (
      persistenceTransaction: PersistenceTransactionContract,
      knowledgeBaseRepository: KnowledgeBaseRepositoryContract,
      loadRetrievalKnowledgeBaseDocuments: LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract,
      loadRetrievalDocuments: LoadRetrievalDocumentsQueryHandlerContract,
      loadRetrievalDocumentIndexes: LoadRetrievalDocumentIndexesQueryHandlerContract,
      loadRetrievalDocumentRevisions: LoadRetrievalDocumentRevisionsQueryHandlerContract,
      loadRetrievalIndexChunks: LoadRetrievalIndexChunksQueryHandlerContract,
      loadRetrievalDocumentRelations: LoadRetrievalDocumentRelationsQueryHandlerContract,
      findRetrievalChunkCandidates: FindRetrievalChunkCandidatesQueryHandlerContract,
      loadRetrievalChunkContext: LoadRetrievalChunkContextQueryHandlerContract,
      embeddingProvider: EmbeddingProvider,
      retrievalProfiles: RetrievalProfileSettingsDTO,
    ) =>
      new RetrieveKnowledgeBaseContentQueryHandler(
        persistenceTransaction,
        knowledgeBaseRepository,
        loadRetrievalKnowledgeBaseDocuments,
        loadRetrievalDocuments,
        loadRetrievalDocumentIndexes,
        loadRetrievalDocumentRevisions,
        loadRetrievalIndexChunks,
        loadRetrievalDocumentRelations,
        findRetrievalChunkCandidates,
        loadRetrievalChunkContext,
        embeddingProvider,
        retrievalProfiles,
      ),
    inject: [
      PersistenceTransactionContract,
      KnowledgeBaseRepositoryContract,
      LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract,
      LoadRetrievalDocumentsQueryHandlerContract,
      LoadRetrievalDocumentIndexesQueryHandlerContract,
      LoadRetrievalDocumentRevisionsQueryHandlerContract,
      LoadRetrievalIndexChunksQueryHandlerContract,
      LoadRetrievalDocumentRelationsQueryHandlerContract,
      FindRetrievalChunkCandidatesQueryHandlerContract,
      LoadRetrievalChunkContextQueryHandlerContract,
      EmbeddingProvider,
      DOCUMENT_INDEX_PIPELINE_SETTINGS,
    ],
  },
]
