import { Module } from '@nestjs/common'

import { ChunksModule } from './chunks.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { CollectIndexChunkGarbageUseCaseContract } from '../../Application/Chunks/Contracts/collect-index-chunk-garbage.use-case.contract.ts'
import { CollectDocumentIndexGarbageUseCaseContract } from '../../Application/DocumentIndexes/Contracts/collect-document-index-garbage.use-case.contract.ts'
import { DocumentIndexExecutionQueue } from '../../Application/DocumentIndexes/Contracts/document-index-execution.queue.ts'
import { DocumentIndexFailureArchive } from '../../Application/DocumentIndexes/Contracts/document-index-failure.archive.ts'
import { DocumentIndexRepository as DocumentIndexRepositoryContract } from '../../Application/DocumentIndexes/Contracts/document-index.repository.ts'
import { StartDocumentIndexPruningRetentionUseCaseContract } from '../../Application/DocumentIndexes/Contracts/start-document-index-pruning-retention.use-case.contract.ts'
import { CollectDocumentIndexGarbageUseCase } from '../../Application/DocumentIndexes/UseCases/collect-document-index-garbage.use-case.ts'
import { StartDocumentIndexPruningRetentionUseCase } from '../../Application/DocumentIndexes/UseCases/start-document-index-pruning-retention.use-case.ts'
import { CollectDocumentRelationGarbageUseCaseContract } from '../../Application/DocumentRelations/Contracts/collect-document-relation-garbage.use-case.contract.ts'
import { InspectKnowledgeBaseDocumentRetentionUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/inspect-knowledge-base-document-retention.use-case.contract.ts'

@Module({
  imports: [DocumentIndexesModule, KnowledgeBaseDocumentsModule, DocumentRelationsModule, ChunksModule],
  providers: [
    {
      provide: CollectDocumentIndexGarbageUseCase,
      useFactory: (
        documentIndexRepository: DocumentIndexRepositoryContract,
        jobRepository: DocumentIndexExecutionQueue,
        failedJobRepository: DocumentIndexFailureArchive,
        knowledgeBaseDocumentRetention: InspectKnowledgeBaseDocumentRetentionUseCaseContract,
        relationGarbage: CollectDocumentRelationGarbageUseCaseContract,
        chunkGarbage: CollectIndexChunkGarbageUseCaseContract,
      ) =>
        new CollectDocumentIndexGarbageUseCase(
          documentIndexRepository,
          jobRepository,
          failedJobRepository,
          knowledgeBaseDocumentRetention,
          relationGarbage,
          chunkGarbage,
        ),
      inject: [
        DocumentIndexRepositoryContract,
        DocumentIndexExecutionQueue,
        DocumentIndexFailureArchive,
        InspectKnowledgeBaseDocumentRetentionUseCaseContract,
        CollectDocumentRelationGarbageUseCaseContract,
        CollectIndexChunkGarbageUseCaseContract,
      ],
    },
    {
      provide: StartDocumentIndexPruningRetentionUseCase,
      useFactory: (
        documentIndexRepository: DocumentIndexRepositoryContract,
        jobRepository: DocumentIndexExecutionQueue,
        knowledgeBaseDocumentRetention: InspectKnowledgeBaseDocumentRetentionUseCaseContract,
      ) =>
        new StartDocumentIndexPruningRetentionUseCase(
          documentIndexRepository,
          jobRepository,
          knowledgeBaseDocumentRetention,
        ),
      inject: [
        DocumentIndexRepositoryContract,
        DocumentIndexExecutionQueue,
        InspectKnowledgeBaseDocumentRetentionUseCaseContract,
      ],
    },
    { provide: CollectDocumentIndexGarbageUseCaseContract, useExisting: CollectDocumentIndexGarbageUseCase },
    {
      provide: StartDocumentIndexPruningRetentionUseCaseContract,
      useExisting: StartDocumentIndexPruningRetentionUseCase,
    },
  ],
  exports: [CollectDocumentIndexGarbageUseCaseContract, StartDocumentIndexPruningRetentionUseCaseContract],
})
export class DocumentIndexRetentionModule {}
