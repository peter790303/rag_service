import { Module } from '@nestjs/common'

import { ChunksModule } from './chunks.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { MembershipsModule } from './memberships.module.ts'
import { CollectIndexChunkGarbageUseCaseContract } from '../../Application/Chunks/Contracts/collect-index-chunk-garbage.use-case.contract.ts'
import { CollectDocumentIndexGarbageUseCaseContract } from '../../Application/DocumentIndexes/Contracts/collect-document-index-garbage.use-case.contract.ts'
import { DocumentIndexExecutionQueue } from '../../Application/DocumentIndexes/Contracts/document-index-execution.queue.ts'
import { DocumentIndexFailureArchive } from '../../Application/DocumentIndexes/Contracts/document-index-failure.archive.ts'
import { DocumentIndexRepository as DocumentIndexRepositoryContract } from '../../Application/DocumentIndexes/Contracts/document-index.repository.ts'
import { StartDocumentIndexPruningRetentionUseCaseContract } from '../../Application/DocumentIndexes/Contracts/start-document-index-pruning-retention.use-case.contract.ts'
import { CollectDocumentIndexGarbageUseCase } from '../../Application/DocumentIndexes/UseCases/collect-document-index-garbage.use-case.ts'
import { StartDocumentIndexPruningRetentionUseCase } from '../../Application/DocumentIndexes/UseCases/start-document-index-pruning-retention.use-case.ts'
import { CollectDocumentRelationGarbageUseCaseContract } from '../../Application/DocumentRelations/Contracts/collect-document-relation-garbage.use-case.contract.ts'
import { InspectMembershipRetentionUseCaseContract } from '../../Application/Memberships/Contracts/inspect-membership-retention.use-case.contract.ts'

@Module({
  imports: [DocumentIndexesModule, MembershipsModule, DocumentRelationsModule, ChunksModule],
  providers: [
    {
      provide: CollectDocumentIndexGarbageUseCase,
      useFactory: (
        documentIndexRepository: DocumentIndexRepositoryContract,
        jobRepository: DocumentIndexExecutionQueue,
        failedJobRepository: DocumentIndexFailureArchive,
        membershipRetention: InspectMembershipRetentionUseCaseContract,
        relationGarbage: CollectDocumentRelationGarbageUseCaseContract,
        chunkGarbage: CollectIndexChunkGarbageUseCaseContract,
      ) =>
        new CollectDocumentIndexGarbageUseCase(
          documentIndexRepository,
          jobRepository,
          failedJobRepository,
          membershipRetention,
          relationGarbage,
          chunkGarbage,
        ),
      inject: [
        DocumentIndexRepositoryContract,
        DocumentIndexExecutionQueue,
        DocumentIndexFailureArchive,
        InspectMembershipRetentionUseCaseContract,
        CollectDocumentRelationGarbageUseCaseContract,
        CollectIndexChunkGarbageUseCaseContract,
      ],
    },
    {
      provide: StartDocumentIndexPruningRetentionUseCase,
      useFactory: (
        documentIndexRepository: DocumentIndexRepositoryContract,
        jobRepository: DocumentIndexExecutionQueue,
        membershipRetention: InspectMembershipRetentionUseCaseContract,
      ) => new StartDocumentIndexPruningRetentionUseCase(documentIndexRepository, jobRepository, membershipRetention),
      inject: [DocumentIndexRepositoryContract, DocumentIndexExecutionQueue, InspectMembershipRetentionUseCaseContract],
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
