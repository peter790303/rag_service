import { Module } from '@nestjs/common'

import { PersistenceModule } from './persistence.module.ts'
import { DocumentIndexExecutionQueue } from '../../Application/DocumentIndexes/Contracts/document-index-execution.queue.ts'
import { DocumentIndexFailureArchive } from '../../Application/DocumentIndexes/Contracts/document-index-failure.archive.ts'
import { DocumentIndexRepository as DocumentIndexRepositoryContract } from '../../Application/DocumentIndexes/Contracts/document-index.repository.ts'
import { InspectDocumentIndexRetentionUseCaseContract } from '../../Application/DocumentIndexes/Contracts/inspect-document-index-retention.use-case.contract.ts'
import { LoadRetrievalDocumentIndexesUseCaseContract } from '../../Application/DocumentIndexes/Contracts/load-retrieval-document-indexes.use-case.contract.ts'
import { PlanDocumentIndexGarbageUseCaseContract } from '../../Application/DocumentIndexes/Contracts/plan-document-index-garbage.use-case.contract.ts'
import { InspectDocumentIndexRetentionUseCase } from '../../Application/DocumentIndexes/UseCases/inspect-document-index-retention.use-case.ts'
import { LoadRetrievalDocumentIndexesUseCase } from '../../Application/DocumentIndexes/UseCases/load-retrieval-document-indexes.use-case.ts'
import { PlanDocumentIndexGarbageUseCase } from '../../Application/DocumentIndexes/UseCases/plan-document-index-garbage.use-case.ts'
import { DocumentIndexRepository } from '../Persistence/Repositories/document-index.repository.ts'
import { FailedJobRepository } from '../Persistence/Repositories/failed-job.repository.ts'
import { JobRepository } from '../Persistence/Repositories/job.repository.ts'

@Module({
  imports: [PersistenceModule],
  providers: [
    DocumentIndexRepository,
    JobRepository,
    FailedJobRepository,
    {
      provide: InspectDocumentIndexRetentionUseCase,
      useFactory: (
        documentIndexRepository: DocumentIndexRepositoryContract,
        jobRepository: DocumentIndexExecutionQueue,
        failedJobRepository: DocumentIndexFailureArchive,
      ) => new InspectDocumentIndexRetentionUseCase(documentIndexRepository, jobRepository, failedJobRepository),
      inject: [DocumentIndexRepositoryContract, DocumentIndexExecutionQueue, DocumentIndexFailureArchive],
    },
    {
      provide: LoadRetrievalDocumentIndexesUseCase,
      useFactory: (repository: DocumentIndexRepositoryContract) => new LoadRetrievalDocumentIndexesUseCase(repository),
      inject: [DocumentIndexRepositoryContract],
    },
    {
      provide: PlanDocumentIndexGarbageUseCase,
      useFactory: (
        documentIndexRepository: DocumentIndexRepositoryContract,
        failedJobRepository: DocumentIndexFailureArchive,
      ) => new PlanDocumentIndexGarbageUseCase(documentIndexRepository, failedJobRepository),
      inject: [DocumentIndexRepositoryContract, DocumentIndexFailureArchive],
    },
    { provide: InspectDocumentIndexRetentionUseCaseContract, useExisting: InspectDocumentIndexRetentionUseCase },
    { provide: LoadRetrievalDocumentIndexesUseCaseContract, useExisting: LoadRetrievalDocumentIndexesUseCase },
    { provide: PlanDocumentIndexGarbageUseCaseContract, useExisting: PlanDocumentIndexGarbageUseCase },
    { provide: DocumentIndexRepositoryContract, useExisting: DocumentIndexRepository },
    { provide: DocumentIndexExecutionQueue, useExisting: JobRepository },
    { provide: DocumentIndexFailureArchive, useExisting: FailedJobRepository },
  ],
  exports: [
    DocumentIndexRepositoryContract,
    DocumentIndexExecutionQueue,
    DocumentIndexFailureArchive,
    InspectDocumentIndexRetentionUseCaseContract,
    PlanDocumentIndexGarbageUseCaseContract,
    LoadRetrievalDocumentIndexesUseCaseContract,
  ],
})
export class DocumentIndexesModule {}
