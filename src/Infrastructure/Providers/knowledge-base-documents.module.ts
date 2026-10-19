import { Module } from '@nestjs/common'

import { PersistenceModule } from './persistence.module.ts'
import { ActivateKnowledgeBaseDocumentIndexUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/activate-knowledge-base-document-index.use-case.contract.ts'
import { CompleteKnowledgeBaseDocumentIndexingUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/complete-knowledge-base-document-indexing.use-case.contract.ts'
import { GetKnowledgeBaseDocumentIndexingStateUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/get-knowledge-base-document-indexing-state.use-case.contract.ts'
import { InspectKnowledgeBaseDocumentRetentionUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/inspect-knowledge-base-document-retention.use-case.contract.ts'
import { KnowledgeBaseDocumentRepository as KnowledgeBaseDocumentRepositoryContract } from '../../Application/KnowledgeBaseDocuments/Contracts/knowledge-base-document.repository.ts'
import { LoadRetrievalKnowledgeBaseDocumentsUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/load-retrieval-knowledge-base-documents.use-case.contract.ts'
import { PrepareKnowledgeBaseDocumentForIndexRequestUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/prepare-knowledge-base-document-for-index-request.use-case.contract.ts'
import { ReserveKnowledgeBaseDocumentForIndexingUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/reserve-knowledge-base-document-for-indexing.use-case.contract.ts'
import { SaveKnowledgeBaseDocumentIndexRequestUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/save-knowledge-base-document-index-request.use-case.contract.ts'
import { ActivateKnowledgeBaseDocumentIndexUseCase } from '../../Application/KnowledgeBaseDocuments/UseCases/activate-knowledge-base-document-index.use-case.ts'
import { CompleteKnowledgeBaseDocumentIndexingUseCase } from '../../Application/KnowledgeBaseDocuments/UseCases/complete-knowledge-base-document-indexing.use-case.ts'
import { GetKnowledgeBaseDocumentIndexingStateUseCase } from '../../Application/KnowledgeBaseDocuments/UseCases/get-knowledge-base-document-indexing-state.use-case.ts'
import { InspectKnowledgeBaseDocumentRetentionUseCase } from '../../Application/KnowledgeBaseDocuments/UseCases/inspect-knowledge-base-document-retention.use-case.ts'
import { LoadRetrievalKnowledgeBaseDocumentsUseCase } from '../../Application/KnowledgeBaseDocuments/UseCases/load-retrieval-knowledge-base-documents.use-case.ts'
import { PrepareKnowledgeBaseDocumentForIndexRequestUseCase } from '../../Application/KnowledgeBaseDocuments/UseCases/prepare-knowledge-base-document-for-index-request.use-case.ts'
import { ReserveKnowledgeBaseDocumentForIndexingUseCase } from '../../Application/KnowledgeBaseDocuments/UseCases/reserve-knowledge-base-document-for-indexing.use-case.ts'
import { SaveKnowledgeBaseDocumentIndexRequestUseCase } from '../../Application/KnowledgeBaseDocuments/UseCases/save-knowledge-base-document-index-request.use-case.ts'
import { KnowledgeBaseDocumentRepository } from '../Persistence/Repositories/knowledge-base-document.repository.ts'

@Module({
  imports: [PersistenceModule],
  providers: [
    KnowledgeBaseDocumentRepository,
    {
      provide: ActivateKnowledgeBaseDocumentIndexUseCase,
      useFactory: (knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepositoryContract) =>
        new ActivateKnowledgeBaseDocumentIndexUseCase(knowledgeBaseDocumentRepository),
      inject: [KnowledgeBaseDocumentRepositoryContract],
    },
    {
      provide: CompleteKnowledgeBaseDocumentIndexingUseCase,
      useFactory: (knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepositoryContract) =>
        new CompleteKnowledgeBaseDocumentIndexingUseCase(knowledgeBaseDocumentRepository),
      inject: [KnowledgeBaseDocumentRepositoryContract],
    },
    {
      provide: GetKnowledgeBaseDocumentIndexingStateUseCase,
      useFactory: (knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepositoryContract) =>
        new GetKnowledgeBaseDocumentIndexingStateUseCase(knowledgeBaseDocumentRepository),
      inject: [KnowledgeBaseDocumentRepositoryContract],
    },
    {
      provide: InspectKnowledgeBaseDocumentRetentionUseCase,
      useFactory: (knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepositoryContract) =>
        new InspectKnowledgeBaseDocumentRetentionUseCase(knowledgeBaseDocumentRepository),
      inject: [KnowledgeBaseDocumentRepositoryContract],
    },
    {
      provide: LoadRetrievalKnowledgeBaseDocumentsUseCase,
      useFactory: (knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepositoryContract) =>
        new LoadRetrievalKnowledgeBaseDocumentsUseCase(knowledgeBaseDocumentRepository),
      inject: [KnowledgeBaseDocumentRepositoryContract],
    },
    {
      provide: PrepareKnowledgeBaseDocumentForIndexRequestUseCase,
      useFactory: (knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepositoryContract) =>
        new PrepareKnowledgeBaseDocumentForIndexRequestUseCase(knowledgeBaseDocumentRepository),
      inject: [KnowledgeBaseDocumentRepositoryContract],
    },
    {
      provide: ReserveKnowledgeBaseDocumentForIndexingUseCase,
      useFactory: (knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepositoryContract) =>
        new ReserveKnowledgeBaseDocumentForIndexingUseCase(knowledgeBaseDocumentRepository),
      inject: [KnowledgeBaseDocumentRepositoryContract],
    },
    {
      provide: SaveKnowledgeBaseDocumentIndexRequestUseCase,
      useFactory: (knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepositoryContract) =>
        new SaveKnowledgeBaseDocumentIndexRequestUseCase(knowledgeBaseDocumentRepository),
      inject: [KnowledgeBaseDocumentRepositoryContract],
    },
    {
      provide: ActivateKnowledgeBaseDocumentIndexUseCaseContract,
      useExisting: ActivateKnowledgeBaseDocumentIndexUseCase,
    },
    {
      provide: CompleteKnowledgeBaseDocumentIndexingUseCaseContract,
      useExisting: CompleteKnowledgeBaseDocumentIndexingUseCase,
    },
    {
      provide: GetKnowledgeBaseDocumentIndexingStateUseCaseContract,
      useExisting: GetKnowledgeBaseDocumentIndexingStateUseCase,
    },
    {
      provide: InspectKnowledgeBaseDocumentRetentionUseCaseContract,
      useExisting: InspectKnowledgeBaseDocumentRetentionUseCase,
    },
    {
      provide: LoadRetrievalKnowledgeBaseDocumentsUseCaseContract,
      useExisting: LoadRetrievalKnowledgeBaseDocumentsUseCase,
    },
    {
      provide: PrepareKnowledgeBaseDocumentForIndexRequestUseCaseContract,
      useExisting: PrepareKnowledgeBaseDocumentForIndexRequestUseCase,
    },
    {
      provide: ReserveKnowledgeBaseDocumentForIndexingUseCaseContract,
      useExisting: ReserveKnowledgeBaseDocumentForIndexingUseCase,
    },
    {
      provide: SaveKnowledgeBaseDocumentIndexRequestUseCaseContract,
      useExisting: SaveKnowledgeBaseDocumentIndexRequestUseCase,
    },
    { provide: KnowledgeBaseDocumentRepositoryContract, useExisting: KnowledgeBaseDocumentRepository },
  ],
  exports: [
    ReserveKnowledgeBaseDocumentForIndexingUseCaseContract,
    ActivateKnowledgeBaseDocumentIndexUseCaseContract,
    CompleteKnowledgeBaseDocumentIndexingUseCaseContract,
    GetKnowledgeBaseDocumentIndexingStateUseCaseContract,
    PrepareKnowledgeBaseDocumentForIndexRequestUseCaseContract,
    SaveKnowledgeBaseDocumentIndexRequestUseCaseContract,
    InspectKnowledgeBaseDocumentRetentionUseCaseContract,
    KnowledgeBaseDocumentRepositoryContract,
    LoadRetrievalKnowledgeBaseDocumentsUseCaseContract,
  ],
})
export class KnowledgeBaseDocumentsModule {}
