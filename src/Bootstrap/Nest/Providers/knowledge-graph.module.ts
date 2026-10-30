import { Module } from '@nestjs/common'

import { ChunksModule } from './chunks.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { KnowledgeBasesModule } from './knowledge-bases.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { FindGraphChunkCandidatesQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/find-graph-chunk-candidates.query.handler.contract.ts'
import { LoadGraphChunksQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/load-graph-chunks.query.handler.contract.ts'
import { LoadRetrievalDocumentIndexesQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/load-retrieval-document-indexes.query.handler.contract.ts'
import { LoadRetrievalDocumentRelationsQueryHandlerContract } from '../../../Documents/Application/Contracts/load-retrieval-document-relations.query.handler.contract.ts'
import { LoadRetrievalDocumentsQueryHandlerContract } from '../../../Documents/Application/Contracts/load-retrieval-documents.query.handler.contract.ts'
import { LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract } from '../../../KnowledgeBases/Application/Contracts/load-retrieval-knowledge-base-documents.query.handler.contract.ts'
import { KnowledgeBaseRepository } from '../../../KnowledgeBases/Application/Ports/Out/Repositories/knowledge-base.repository.ts'
import { ListKnowledgeGraphProjectsQueryHandler } from '../../../KnowledgeBases/Application/Queries/list-knowledge-graph-projects.query.handler.ts'
import { LoadKnowledgeGraphQueryHandler } from '../../../KnowledgeBases/Application/Queries/load-knowledge-graph.query.handler.ts'
import { PersistenceTransaction } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'

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
      provide: LoadKnowledgeGraphQueryHandler,
      useFactory: (
        transaction: PersistenceTransaction,
        repository: KnowledgeBaseRepository,
        memberships: LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract,
        documents: LoadRetrievalDocumentsQueryHandlerContract,
        indexes: LoadRetrievalDocumentIndexesQueryHandlerContract,
        relations: LoadRetrievalDocumentRelationsQueryHandlerContract,
        chunks: LoadGraphChunksQueryHandlerContract,
        candidates: FindGraphChunkCandidatesQueryHandlerContract,
      ) =>
        new LoadKnowledgeGraphQueryHandler(
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
        LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract,
        LoadRetrievalDocumentsQueryHandlerContract,
        LoadRetrievalDocumentIndexesQueryHandlerContract,
        LoadRetrievalDocumentRelationsQueryHandlerContract,
        LoadGraphChunksQueryHandlerContract,
        FindGraphChunkCandidatesQueryHandlerContract,
      ],
    },
    {
      provide: ListKnowledgeGraphProjectsQueryHandler,
      useFactory: (transaction: PersistenceTransaction, repository: KnowledgeBaseRepository) =>
        new ListKnowledgeGraphProjectsQueryHandler(transaction, repository),
      inject: [PersistenceTransaction, KnowledgeBaseRepository],
    },
  ],
  exports: [LoadKnowledgeGraphQueryHandler, ListKnowledgeGraphProjectsQueryHandler],
})
export class KnowledgeGraphModule {}
