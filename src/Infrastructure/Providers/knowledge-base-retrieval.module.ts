import { Module } from '@nestjs/common'

import { ChunksModule } from './chunks.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { EmbeddingModule } from './embedding.module.ts'
import { IndexingProfilesModule, DOCUMENT_INDEX_PIPELINE_SETTINGS } from './indexing-profiles.module.ts'
import { KnowledgeBasesModule } from './knowledge-bases.module.ts'
import { MembershipsModule } from './memberships.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { FindRetrievalChunkCandidatesUseCaseContract } from '../../Application/Chunks/Contracts/find-retrieval-chunk-candidates.use-case.contract.ts'
import { LoadRetrievalChunkContextUseCaseContract } from '../../Application/Chunks/Contracts/load-retrieval-chunk-context.use-case.contract.ts'
import { LoadRetrievalIndexChunksUseCaseContract } from '../../Application/Chunks/Contracts/load-retrieval-index-chunks.use-case.contract.ts'
import { LoadRetrievalDocumentIndexesUseCaseContract } from '../../Application/DocumentIndexes/Contracts/load-retrieval-document-indexes.use-case.contract.ts'
import { LoadRetrievalDocumentRelationsUseCaseContract } from '../../Application/DocumentRelations/Contracts/load-retrieval-document-relations.use-case.contract.ts'
import { LoadRetrievalDocumentRevisionsUseCaseContract } from '../../Application/DocumentRevisions/Contracts/load-retrieval-document-revisions.use-case.contract.ts'
import { LoadRetrievalDocumentsUseCaseContract } from '../../Application/Documents/Contracts/load-retrieval-documents.use-case.contract.ts'
import { EmbeddingProvider } from '../../Application/KnowledgeBases/Contracts/embedding-provider.ts'
import { KnowledgeBaseRepository as KnowledgeBaseRepositoryContract } from '../../Application/KnowledgeBases/Contracts/knowledge-base.repository.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../Application/KnowledgeBases/Contracts/persistence-transaction.ts'
import { RetrievalProfileSettingsDto } from '../../Application/KnowledgeBases/DataTransferObjects/retrieval-profile-settings.dto.ts'
import { RetrieveKnowledgeBaseContentUseCase } from '../../Application/KnowledgeBases/UseCases/retrieve-knowledge-base-content.use-case.ts'
import { LoadRetrievalMembershipsUseCaseContract } from '../../Application/Memberships/Contracts/load-retrieval-memberships.use-case.contract.ts'

@Module({
  imports: [
    PersistenceModule,
    KnowledgeBasesModule,
    MembershipsModule,
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
      provide: RetrieveKnowledgeBaseContentUseCase,
      useFactory: (
        persistenceTransaction: PersistenceTransactionContract,
        knowledgeBaseRepository: KnowledgeBaseRepositoryContract,
        loadRetrievalMemberships: LoadRetrievalMembershipsUseCaseContract,
        loadRetrievalDocuments: LoadRetrievalDocumentsUseCaseContract,
        loadRetrievalDocumentIndexes: LoadRetrievalDocumentIndexesUseCaseContract,
        loadRetrievalDocumentRevisions: LoadRetrievalDocumentRevisionsUseCaseContract,
        loadRetrievalIndexChunks: LoadRetrievalIndexChunksUseCaseContract,
        loadRetrievalDocumentRelations: LoadRetrievalDocumentRelationsUseCaseContract,
        findRetrievalChunkCandidates: FindRetrievalChunkCandidatesUseCaseContract,
        loadRetrievalChunkContext: LoadRetrievalChunkContextUseCaseContract,
        embeddingProvider: EmbeddingProvider,
        retrievalProfiles: RetrievalProfileSettingsDto,
      ) =>
        new RetrieveKnowledgeBaseContentUseCase(
          persistenceTransaction,
          knowledgeBaseRepository,
          loadRetrievalMemberships,
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
        LoadRetrievalMembershipsUseCaseContract,
        LoadRetrievalDocumentsUseCaseContract,
        LoadRetrievalDocumentIndexesUseCaseContract,
        LoadRetrievalDocumentRevisionsUseCaseContract,
        LoadRetrievalIndexChunksUseCaseContract,
        LoadRetrievalDocumentRelationsUseCaseContract,
        FindRetrievalChunkCandidatesUseCaseContract,
        LoadRetrievalChunkContextUseCaseContract,
        EmbeddingProvider,
        DOCUMENT_INDEX_PIPELINE_SETTINGS,
      ],
    },
  ],
  exports: [RetrieveKnowledgeBaseContentUseCase],
})
export class KnowledgeBaseRetrievalModule {}
