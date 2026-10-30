import { Module } from '@nestjs/common'

import { ChunksModule } from './chunks.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { EmbeddingModule } from './embedding.module.ts'
import { IndexingProfilesModule, DOCUMENT_INDEX_PIPELINE_SETTINGS } from './indexing-profiles.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { KnowledgeBasesModule } from './knowledge-bases.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { FindRetrievalChunkCandidatesQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/find-retrieval-chunk-candidates.query.handler.contract.ts'
import { LoadRetrievalChunkContextQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/load-retrieval-chunk-context.query.handler.contract.ts'
import { LoadRetrievalDocumentIndexesQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/load-retrieval-document-indexes.query.handler.contract.ts'
import { LoadRetrievalIndexChunksQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/load-retrieval-index-chunks.query.handler.contract.ts'
import { LoadRetrievalDocumentRelationsQueryHandlerContract } from '../../../Documents/Application/Contracts/load-retrieval-document-relations.query.handler.contract.ts'
import { LoadRetrievalDocumentRevisionsQueryHandlerContract } from '../../../Documents/Application/Contracts/load-retrieval-document-revisions.query.handler.contract.ts'
import { LoadRetrievalDocumentsQueryHandlerContract } from '../../../Documents/Application/Contracts/load-retrieval-documents.query.handler.contract.ts'
import { LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract } from '../../../KnowledgeBases/Application/Contracts/load-retrieval-knowledge-base-documents.query.handler.contract.ts'
import { RetrievalProfileSettingsDTO } from '../../../KnowledgeBases/Application/DataTransferObjects/retrieval-profile-settings.dto.ts'
import { KnowledgeBaseRepository as KnowledgeBaseRepositoryContract } from '../../../KnowledgeBases/Application/Ports/Out/Repositories/knowledge-base.repository.ts'
import { RetrieveKnowledgeBaseContentQueryHandler } from '../../../KnowledgeBases/Application/Queries/retrieve-knowledge-base-content.query.handler.ts'
import { EmbeddingProvider } from '../../../Shared/Application/Ports/Out/Gateways/embedding-provider.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'

@Module({
  imports: [
    PersistenceModule,
    KnowledgeBasesModule,
    KnowledgeBaseDocumentsModule,
    DocumentsModule,
    DocumentIndexesModule,
    DocumentRevisionsModule,
    ChunksModule,
    DocumentRelationsModule,
    EmbeddingModule,
    IndexingProfilesModule,
  ],
  providers: [
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
  ],
  exports: [RetrieveKnowledgeBaseContentQueryHandler],
})
export class KnowledgeBaseRetrievalModule {}
