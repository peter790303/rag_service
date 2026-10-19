import { Module } from '@nestjs/common'

import { PersistenceModule } from './persistence.module.ts'
import { DocumentIndexExecutionQueue } from '../../Application/DocumentIndexes/Contracts/document-index-execution.queue.ts'
import { DocumentIndexFailureArchive } from '../../Application/DocumentIndexes/Contracts/document-index-failure.archive.ts'
import { DocumentIndexSuccessArchive } from '../../Application/DocumentIndexes/Contracts/document-index-success.archive.ts'
import { DocumentIndexRepository as DocumentIndexRepositoryContract } from '../../Application/DocumentIndexes/Contracts/document-index.repository.ts'
import { InspectDocumentIndexRetentionUseCaseContract } from '../../Application/DocumentIndexes/Contracts/inspect-document-index-retention.use-case.contract.ts'
import { LoadRetrievalDocumentIndexesUseCaseContract } from '../../Application/DocumentIndexes/Contracts/load-retrieval-document-indexes.use-case.contract.ts'
import { PlanDocumentIndexGarbageUseCaseContract } from '../../Application/DocumentIndexes/Contracts/plan-document-index-garbage.use-case.contract.ts'
import { CancelKnowledgeBaseDocumentDocumentIndexingListener } from '../../Application/DocumentIndexes/Listeners/cancel-knowledge-base-document-document-indexing.listener.ts'
import { InspectDocumentIndexRetentionUseCase } from '../../Application/DocumentIndexes/UseCases/inspect-document-index-retention.use-case.ts'
import { LoadRetrievalDocumentIndexesUseCase } from '../../Application/DocumentIndexes/UseCases/load-retrieval-document-indexes.use-case.ts'
import { PlanDocumentIndexGarbageUseCase } from '../../Application/DocumentIndexes/UseCases/plan-document-index-garbage.use-case.ts'
import { DocumentIndexSuccessReceiptRepository } from '../Persistence/Repositories/document-index-success-receipt.repository.ts'
import { DocumentIndexRepository } from '../Persistence/Repositories/document-index.repository.ts'
import { FailedJobRepository } from '../Persistence/Repositories/failed-job.repository.ts'
import { JobRepository } from '../Persistence/Repositories/job.repository.ts'

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
      provide: InspectDocumentIndexRetentionUseCase,
      useFactory: (documentIndexRepository: DocumentIndexRepositoryContract) =>
        new InspectDocumentIndexRetentionUseCase(documentIndexRepository),
      inject: [DocumentIndexRepositoryContract],
    },
    {
      provide: LoadRetrievalDocumentIndexesUseCase,
      useFactory: (repository: DocumentIndexRepositoryContract) => new LoadRetrievalDocumentIndexesUseCase(repository),
      inject: [DocumentIndexRepositoryContract],
    },
    {
      provide: PlanDocumentIndexGarbageUseCase,
      useFactory: (documentIndexRepository: DocumentIndexRepositoryContract) =>
        new PlanDocumentIndexGarbageUseCase(documentIndexRepository),
      inject: [DocumentIndexRepositoryContract],
    },
    { provide: InspectDocumentIndexRetentionUseCaseContract, useExisting: InspectDocumentIndexRetentionUseCase },
    { provide: LoadRetrievalDocumentIndexesUseCaseContract, useExisting: LoadRetrievalDocumentIndexesUseCase },
    { provide: PlanDocumentIndexGarbageUseCaseContract, useExisting: PlanDocumentIndexGarbageUseCase },
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
    InspectDocumentIndexRetentionUseCaseContract,
    PlanDocumentIndexGarbageUseCaseContract,
    LoadRetrievalDocumentIndexesUseCaseContract,
  ],
})
export class DocumentIndexesModule {}
