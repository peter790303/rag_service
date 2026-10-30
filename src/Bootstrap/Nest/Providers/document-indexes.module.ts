import { Module } from '@nestjs/common'

import { PersistenceModule } from './persistence.module.ts'
import { InspectDocumentIndexRetentionQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/inspect-document-index-retention.query.handler.contract.ts'
import { LoadRetrievalDocumentIndexesQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/load-retrieval-document-indexes.query.handler.contract.ts'
import { PlanDocumentIndexGarbageQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/plan-document-index-garbage.query.handler.contract.ts'
import { CancelKnowledgeBaseDocumentDocumentIndexingListener } from '../../../DocumentIndexes/Application/Listeners/cancel-knowledge-base-document-document-indexing.listener.ts'
import { DocumentIndexExecutionQueue } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-execution.queue.ts'
import { DocumentIndexFailureArchive } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-failure.archive.ts'
import { DocumentIndexSuccessArchive } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-success.archive.ts'
import { DocumentIndexRepository as DocumentIndexRepositoryContract } from '../../../DocumentIndexes/Application/Ports/Out/Repositories/document-index.repository.ts'
import { InspectDocumentIndexRetentionQueryHandler } from '../../../DocumentIndexes/Application/Queries/inspect-document-index-retention.query.handler.ts'
import { LoadRetrievalDocumentIndexesQueryHandler } from '../../../DocumentIndexes/Application/Queries/load-retrieval-document-indexes.query.handler.ts'
import { PlanDocumentIndexGarbageQueryHandler } from '../../../DocumentIndexes/Application/Queries/plan-document-index-garbage.query.handler.ts'
import { DocumentIndexSuccessReceiptRepository } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/document-index-success-receipt.repository.ts'
import { DocumentIndexRepository } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/document-index.repository.ts'
import { FailedJobRepository } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/failed-job.repository.ts'
import { JobRepository } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/job.repository.ts'

@Module({
  imports: [PersistenceModule],
  providers: [
    DocumentIndexRepository,
    JobRepository,
    FailedJobRepository,
    DocumentIndexSuccessReceiptRepository,
    {
      provide: CancelKnowledgeBaseDocumentDocumentIndexingListener,
      useFactory: (queue: DocumentIndexExecutionQueue) =>
        new CancelKnowledgeBaseDocumentDocumentIndexingListener(queue),
      inject: [DocumentIndexExecutionQueue],
    },
    {
      provide: InspectDocumentIndexRetentionQueryHandler,
      useFactory: (documentIndexRepository: DocumentIndexRepositoryContract) =>
        new InspectDocumentIndexRetentionQueryHandler(documentIndexRepository),
      inject: [DocumentIndexRepositoryContract],
    },
    {
      provide: LoadRetrievalDocumentIndexesQueryHandler,
      useFactory: (repository: DocumentIndexRepositoryContract) =>
        new LoadRetrievalDocumentIndexesQueryHandler(repository),
      inject: [DocumentIndexRepositoryContract],
    },
    {
      provide: PlanDocumentIndexGarbageQueryHandler,
      useFactory: (documentIndexRepository: DocumentIndexRepositoryContract) =>
        new PlanDocumentIndexGarbageQueryHandler(documentIndexRepository),
      inject: [DocumentIndexRepositoryContract],
    },
    {
      provide: InspectDocumentIndexRetentionQueryHandlerContract,
      useExisting: InspectDocumentIndexRetentionQueryHandler,
    },
    {
      provide: LoadRetrievalDocumentIndexesQueryHandlerContract,
      useExisting: LoadRetrievalDocumentIndexesQueryHandler,
    },
    { provide: PlanDocumentIndexGarbageQueryHandlerContract, useExisting: PlanDocumentIndexGarbageQueryHandler },
    { provide: DocumentIndexRepositoryContract, useExisting: DocumentIndexRepository },
    { provide: DocumentIndexExecutionQueue, useExisting: JobRepository },
    { provide: DocumentIndexFailureArchive, useExisting: FailedJobRepository },
    { provide: DocumentIndexSuccessArchive, useExisting: DocumentIndexSuccessReceiptRepository },
  ],
  exports: [
    DocumentIndexRepositoryContract,
    DocumentIndexExecutionQueue,
    DocumentIndexFailureArchive,
    DocumentIndexSuccessArchive,
    CancelKnowledgeBaseDocumentDocumentIndexingListener,
    InspectDocumentIndexRetentionQueryHandlerContract,
    PlanDocumentIndexGarbageQueryHandlerContract,
    LoadRetrievalDocumentIndexesQueryHandlerContract,
  ],
})
export class DocumentIndexesModule {}
