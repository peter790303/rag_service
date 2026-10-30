import { ActivateKnowledgeBaseDocumentIndexCommandHandler } from '../../../Application/Commands/activate-knowledge-base-document-index.command.handler.ts'
import { CompleteKnowledgeBaseDocumentIndexingCommandHandler } from '../../../Application/Commands/complete-knowledge-base-document-indexing.command.handler.ts'
import { PrepareKnowledgeBaseDocumentForIndexRequestCommandHandler } from '../../../Application/Commands/prepare-knowledge-base-document-for-index-request.command.handler.ts'
import { ReserveKnowledgeBaseDocumentForIndexingCommandHandler } from '../../../Application/Commands/reserve-knowledge-base-document-for-indexing.command.handler.ts'
import { SaveKnowledgeBaseDocumentIndexRequestCommandHandler } from '../../../Application/Commands/save-knowledge-base-document-index-request.command.handler.ts'
import { ActivateKnowledgeBaseDocumentIndexCommandHandlerContract } from '../../../Application/Contracts/activate-knowledge-base-document-index.command.handler.contract.ts'
import { CompleteKnowledgeBaseDocumentIndexingCommandHandlerContract } from '../../../Application/Contracts/complete-knowledge-base-document-indexing.command.handler.contract.ts'
import { GetKnowledgeBaseDocumentIndexingStateQueryHandlerContract } from '../../../Application/Contracts/get-knowledge-base-document-indexing-state.query.handler.contract.ts'
import { InspectKnowledgeBaseDocumentRetentionQueryHandlerContract } from '../../../Application/Contracts/inspect-knowledge-base-document-retention.query.handler.contract.ts'
import { LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract } from '../../../Application/Contracts/load-retrieval-knowledge-base-documents.query.handler.contract.ts'
import { PrepareKnowledgeBaseDocumentForIndexRequestCommandHandlerContract } from '../../../Application/Contracts/prepare-knowledge-base-document-for-index-request.command.handler.contract.ts'
import { ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract } from '../../../Application/Contracts/reserve-knowledge-base-document-for-indexing.command.handler.contract.ts'
import { SaveKnowledgeBaseDocumentIndexRequestCommandHandlerContract } from '../../../Application/Contracts/save-knowledge-base-document-index-request.command.handler.contract.ts'
import { KnowledgeBaseDocumentRepository as KnowledgeBaseDocumentRepositoryContract } from '../../../Application/Ports/Out/Repositories/knowledge-base-document.repository.ts'
import { GetKnowledgeBaseDocumentIndexingStateQueryHandler } from '../../../Application/Queries/get-knowledge-base-document-indexing-state.query.handler.ts'
import { InspectKnowledgeBaseDocumentRetentionQueryHandler } from '../../../Application/Queries/inspect-knowledge-base-document-retention.query.handler.ts'
import { LoadRetrievalKnowledgeBaseDocumentsQueryHandler } from '../../../Application/Queries/load-retrieval-knowledge-base-documents.query.handler.ts'
import { KnowledgeBaseDocumentRepository } from '../../Persistence/TypeORM/Repositories/knowledge-base-document.repository.ts'

export const knowledgeBaseDocumentsProviders = [
  KnowledgeBaseDocumentRepository,
  {
    provide: ActivateKnowledgeBaseDocumentIndexCommandHandler,
    useFactory: (knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepositoryContract) =>
      new ActivateKnowledgeBaseDocumentIndexCommandHandler(knowledgeBaseDocumentRepository),
    inject: [KnowledgeBaseDocumentRepositoryContract],
  },
  {
    provide: CompleteKnowledgeBaseDocumentIndexingCommandHandler,
    useFactory: (knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepositoryContract) =>
      new CompleteKnowledgeBaseDocumentIndexingCommandHandler(knowledgeBaseDocumentRepository),
    inject: [KnowledgeBaseDocumentRepositoryContract],
  },
  {
    provide: GetKnowledgeBaseDocumentIndexingStateQueryHandler,
    useFactory: (knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepositoryContract) =>
      new GetKnowledgeBaseDocumentIndexingStateQueryHandler(knowledgeBaseDocumentRepository),
    inject: [KnowledgeBaseDocumentRepositoryContract],
  },
  {
    provide: InspectKnowledgeBaseDocumentRetentionQueryHandler,
    useFactory: (knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepositoryContract) =>
      new InspectKnowledgeBaseDocumentRetentionQueryHandler(knowledgeBaseDocumentRepository),
    inject: [KnowledgeBaseDocumentRepositoryContract],
  },
  {
    provide: LoadRetrievalKnowledgeBaseDocumentsQueryHandler,
    useFactory: (knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepositoryContract) =>
      new LoadRetrievalKnowledgeBaseDocumentsQueryHandler(knowledgeBaseDocumentRepository),
    inject: [KnowledgeBaseDocumentRepositoryContract],
  },
  {
    provide: PrepareKnowledgeBaseDocumentForIndexRequestCommandHandler,
    useFactory: (knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepositoryContract) =>
      new PrepareKnowledgeBaseDocumentForIndexRequestCommandHandler(knowledgeBaseDocumentRepository),
    inject: [KnowledgeBaseDocumentRepositoryContract],
  },
  {
    provide: ReserveKnowledgeBaseDocumentForIndexingCommandHandler,
    useFactory: (knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepositoryContract) =>
      new ReserveKnowledgeBaseDocumentForIndexingCommandHandler(knowledgeBaseDocumentRepository),
    inject: [KnowledgeBaseDocumentRepositoryContract],
  },
  {
    provide: SaveKnowledgeBaseDocumentIndexRequestCommandHandler,
    useFactory: (knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepositoryContract) =>
      new SaveKnowledgeBaseDocumentIndexRequestCommandHandler(knowledgeBaseDocumentRepository),
    inject: [KnowledgeBaseDocumentRepositoryContract],
  },
  {
    provide: ActivateKnowledgeBaseDocumentIndexCommandHandlerContract,
    useExisting: ActivateKnowledgeBaseDocumentIndexCommandHandler,
  },
  {
    provide: CompleteKnowledgeBaseDocumentIndexingCommandHandlerContract,
    useExisting: CompleteKnowledgeBaseDocumentIndexingCommandHandler,
  },
  {
    provide: GetKnowledgeBaseDocumentIndexingStateQueryHandlerContract,
    useExisting: GetKnowledgeBaseDocumentIndexingStateQueryHandler,
  },
  {
    provide: InspectKnowledgeBaseDocumentRetentionQueryHandlerContract,
    useExisting: InspectKnowledgeBaseDocumentRetentionQueryHandler,
  },
  {
    provide: LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract,
    useExisting: LoadRetrievalKnowledgeBaseDocumentsQueryHandler,
  },
  {
    provide: PrepareKnowledgeBaseDocumentForIndexRequestCommandHandlerContract,
    useExisting: PrepareKnowledgeBaseDocumentForIndexRequestCommandHandler,
  },
  {
    provide: ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
    useExisting: ReserveKnowledgeBaseDocumentForIndexingCommandHandler,
  },
  {
    provide: SaveKnowledgeBaseDocumentIndexRequestCommandHandlerContract,
    useExisting: SaveKnowledgeBaseDocumentIndexRequestCommandHandler,
  },
  { provide: KnowledgeBaseDocumentRepositoryContract, useExisting: KnowledgeBaseDocumentRepository },
]
