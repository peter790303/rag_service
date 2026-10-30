import { InspectDocumentIndexRetentionQueryHandlerContract } from '../../../Application/Contracts/inspect-document-index-retention.query.handler.contract.ts'
import { LoadRetrievalDocumentIndexesQueryHandlerContract } from '../../../Application/Contracts/load-retrieval-document-indexes.query.handler.contract.ts'
import { PlanDocumentIndexGarbageQueryHandlerContract } from '../../../Application/Contracts/plan-document-index-garbage.query.handler.contract.ts'
import { CancelKnowledgeBaseDocumentDocumentIndexingListener } from '../../../Application/Listeners/cancel-knowledge-base-document-document-indexing.listener.ts'
import { DocumentIndexExecutionQueue } from '../../../Application/Ports/Out/Gateways/document-index-execution.queue.ts'
import { DocumentIndexFailureArchive } from '../../../Application/Ports/Out/Gateways/document-index-failure.archive.ts'
import { DocumentIndexSuccessArchive } from '../../../Application/Ports/Out/Gateways/document-index-success.archive.ts'
import { DocumentIndexRepository as DocumentIndexRepositoryContract } from '../../../Application/Ports/Out/Repositories/document-index.repository.ts'
import { InspectDocumentIndexRetentionQueryHandler } from '../../../Application/Queries/inspect-document-index-retention.query.handler.ts'
import { LoadRetrievalDocumentIndexesQueryHandler } from '../../../Application/Queries/load-retrieval-document-indexes.query.handler.ts'
import { PlanDocumentIndexGarbageQueryHandler } from '../../../Application/Queries/plan-document-index-garbage.query.handler.ts'
import { DocumentIndexSuccessReceiptRepository } from '../../Persistence/TypeORM/Repositories/document-index-success-receipt.repository.ts'
import { DocumentIndexRepository } from '../../Persistence/TypeORM/Repositories/document-index.repository.ts'
import { FailedJobRepository } from '../../Persistence/TypeORM/Repositories/failed-job.repository.ts'
import { JobRepository } from '../../Persistence/TypeORM/Repositories/job.repository.ts'

export const documentIndexesProviders = [
  DocumentIndexRepository,
  JobRepository,
  FailedJobRepository,
  DocumentIndexSuccessReceiptRepository,
  {
    provide: CancelKnowledgeBaseDocumentDocumentIndexingListener,
    useFactory: (queue: DocumentIndexExecutionQueue) => new CancelKnowledgeBaseDocumentDocumentIndexingListener(queue),
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
    useFactory: (
      documentIndexRepository: DocumentIndexRepositoryContract,
      failureArchive: DocumentIndexFailureArchive,
    ) => new PlanDocumentIndexGarbageQueryHandler(documentIndexRepository, failureArchive),
    inject: [DocumentIndexRepositoryContract, DocumentIndexFailureArchive],
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
]
