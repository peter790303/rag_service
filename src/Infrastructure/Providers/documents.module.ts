import { Module } from '@nestjs/common'

import { PersistenceModule } from './persistence.module.ts'
import { DocumentRepository as DocumentRepositoryContract } from '../../Application/Documents/Contracts/document.repository.ts'
import { GetDocumentForIndexRetryUseCaseContract } from '../../Application/Documents/Contracts/get-document-for-index-retry.use-case.contract.ts'
import { LoadRetrievalDocumentsUseCaseContract } from '../../Application/Documents/Contracts/load-retrieval-documents.use-case.contract.ts'
import { LockDocumentRetentionParentsUseCaseContract } from '../../Application/Documents/Contracts/lock-document-retention-parents.use-case.contract.ts'
import { PrepareDocumentForIndexRequestUseCaseContract } from '../../Application/Documents/Contracts/prepare-document-for-index-request.use-case.contract.ts'
import { ReserveDocumentForIndexingUseCaseContract } from '../../Application/Documents/Contracts/reserve-document-for-indexing.use-case.contract.ts'
import { GetDocumentForIndexRetryUseCase } from '../../Application/Documents/UseCases/get-document-for-index-retry.use-case.ts'
import { LoadRetrievalDocumentsUseCase } from '../../Application/Documents/UseCases/load-retrieval-documents.use-case.ts'
import { LockDocumentRetentionParentsUseCase } from '../../Application/Documents/UseCases/lock-document-retention-parents.use-case.ts'
import { PrepareDocumentForIndexRequestUseCase } from '../../Application/Documents/UseCases/prepare-document-for-index-request.use-case.ts'
import { ReserveDocumentForIndexingUseCase } from '../../Application/Documents/UseCases/reserve-document-for-indexing.use-case.ts'
import { DocumentRepository } from '../Persistence/Repositories/document.repository.ts'

@Module({
  imports: [PersistenceModule],
  providers: [
    DocumentRepository,
    {
      provide: GetDocumentForIndexRetryUseCase,
      useFactory: (documents: DocumentRepositoryContract) => new GetDocumentForIndexRetryUseCase(documents),
      inject: [DocumentRepositoryContract],
    },
    {
      provide: LoadRetrievalDocumentsUseCase,
      useFactory: (repository: DocumentRepositoryContract) => new LoadRetrievalDocumentsUseCase(repository),
      inject: [DocumentRepositoryContract],
    },
    {
      provide: LockDocumentRetentionParentsUseCase,
      useFactory: (documentRepository: DocumentRepositoryContract) =>
        new LockDocumentRetentionParentsUseCase(documentRepository),
      inject: [DocumentRepositoryContract],
    },
    {
      provide: PrepareDocumentForIndexRequestUseCase,
      useFactory: (documents: DocumentRepositoryContract) => new PrepareDocumentForIndexRequestUseCase(documents),
      inject: [DocumentRepositoryContract],
    },
    {
      provide: ReserveDocumentForIndexingUseCase,
      useFactory: (documents: DocumentRepositoryContract) => new ReserveDocumentForIndexingUseCase(documents),
      inject: [DocumentRepositoryContract],
    },
    { provide: GetDocumentForIndexRetryUseCaseContract, useExisting: GetDocumentForIndexRetryUseCase },
    { provide: LoadRetrievalDocumentsUseCaseContract, useExisting: LoadRetrievalDocumentsUseCase },
    { provide: LockDocumentRetentionParentsUseCaseContract, useExisting: LockDocumentRetentionParentsUseCase },
    { provide: PrepareDocumentForIndexRequestUseCaseContract, useExisting: PrepareDocumentForIndexRequestUseCase },
    { provide: ReserveDocumentForIndexingUseCaseContract, useExisting: ReserveDocumentForIndexingUseCase },
    { provide: DocumentRepositoryContract, useExisting: DocumentRepository },
  ],
  exports: [
    ReserveDocumentForIndexingUseCaseContract,
    PrepareDocumentForIndexRequestUseCaseContract,
    GetDocumentForIndexRetryUseCaseContract,
    DocumentRepositoryContract,
    LockDocumentRetentionParentsUseCase,
    LockDocumentRetentionParentsUseCaseContract,
    LoadRetrievalDocumentsUseCaseContract,
  ],
})
export class DocumentsModule {}
