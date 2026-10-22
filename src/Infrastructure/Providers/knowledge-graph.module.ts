import { Module } from '@nestjs/common'

import { ChunksModule } from './chunks.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { KnowledgeBasesModule } from './knowledge-bases.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { FindGraphChunkCandidatesUseCaseContract } from '../../Application/Chunks/Contracts/find-graph-chunk-candidates.use-case.contract.ts'
import { LoadGraphChunksUseCaseContract } from '../../Application/Chunks/Contracts/load-graph-chunks.use-case.contract.ts'
import { LoadRetrievalDocumentIndexesUseCaseContract } from '../../Application/DocumentIndexes/Contracts/load-retrieval-document-indexes.use-case.contract.ts'
import { LoadRetrievalDocumentRelationsUseCaseContract } from '../../Application/DocumentRelations/Contracts/load-retrieval-document-relations.use-case.contract.ts'
import { LoadRetrievalDocumentsUseCaseContract } from '../../Application/Documents/Contracts/load-retrieval-documents.use-case.contract.ts'
import { LoadRetrievalKnowledgeBaseDocumentsUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/load-retrieval-knowledge-base-documents.use-case.contract.ts'
import { KnowledgeBaseRepository } from '../../Application/KnowledgeBases/Contracts/knowledge-base.repository.ts'
import { PersistenceTransaction } from '../../Application/KnowledgeBases/Contracts/persistence-transaction.ts'
import { ListKnowledgeGraphProjectsUseCase } from '../../Application/KnowledgeBases/UseCases/list-knowledge-graph-projects.use-case.ts'
import { LoadKnowledgeGraphUseCase } from '../../Application/KnowledgeBases/UseCases/load-knowledge-graph.use-case.ts'

@Module({
  imports: [
    PersistenceModule,
    KnowledgeBasesModule,
    KnowledgeBaseDocumentsModule,
    DocumentsModule,
    DocumentIndexesModule,
    DocumentRelationsModule,
    ChunksModule,
  ],
  providers: [
    {
      provide: LoadKnowledgeGraphUseCase,
      useFactory: (
        transaction: PersistenceTransaction,
        repository: KnowledgeBaseRepository,
        memberships: LoadRetrievalKnowledgeBaseDocumentsUseCaseContract,
        documents: LoadRetrievalDocumentsUseCaseContract,
        indexes: LoadRetrievalDocumentIndexesUseCaseContract,
        relations: LoadRetrievalDocumentRelationsUseCaseContract,
        chunks: LoadGraphChunksUseCaseContract,
        candidates: FindGraphChunkCandidatesUseCaseContract,
      ) =>
        new LoadKnowledgeGraphUseCase(
          transaction,
          repository,
          memberships,
          documents,
          indexes,
          relations,
          chunks,
          candidates,
        ),
      inject: [
        PersistenceTransaction,
        KnowledgeBaseRepository,
        LoadRetrievalKnowledgeBaseDocumentsUseCaseContract,
        LoadRetrievalDocumentsUseCaseContract,
        LoadRetrievalDocumentIndexesUseCaseContract,
        LoadRetrievalDocumentRelationsUseCaseContract,
        LoadGraphChunksUseCaseContract,
        FindGraphChunkCandidatesUseCaseContract,
      ],
    },
    {
      provide: ListKnowledgeGraphProjectsUseCase,
      useFactory: (transaction: PersistenceTransaction, repository: KnowledgeBaseRepository) =>
        new ListKnowledgeGraphProjectsUseCase(transaction, repository),
      inject: [PersistenceTransaction, KnowledgeBaseRepository],
    },
  ],
  exports: [LoadKnowledgeGraphUseCase, ListKnowledgeGraphProjectsUseCase],
})
export class KnowledgeGraphModule {}
