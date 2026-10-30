import { EnsureIndexingKnowledgeBaseCommandHandler } from '../../../KnowledgeBases/Application/Commands/ensure-indexing-knowledge-base.command.handler.ts'
import { ValidateKnowledgeBasePruningCommandHandler } from '../../../KnowledgeBases/Application/Commands/validate-knowledge-base-pruning.command.handler.ts'
import { EnsureIndexingKnowledgeBaseCommandHandlerContract } from '../../../KnowledgeBases/Application/Contracts/ensure-indexing-knowledge-base.command.handler.contract.ts'
import { GetIndexingKnowledgeBaseQueryHandlerContract } from '../../../KnowledgeBases/Application/Contracts/get-indexing-knowledge-base.query.handler.contract.ts'
import { ValidateKnowledgeBasePruningCommandHandlerContract } from '../../../KnowledgeBases/Application/Contracts/validate-knowledge-base-pruning.command.handler.contract.ts'
import { KnowledgeBaseRepository as KnowledgeBaseRepositoryContract } from '../../../KnowledgeBases/Application/Ports/Out/Repositories/knowledge-base.repository.ts'
import { GetIndexingKnowledgeBaseQueryHandler } from '../../../KnowledgeBases/Application/Queries/get-indexing-knowledge-base.query.handler.ts'
import { KnowledgeBaseRepository } from '../../../KnowledgeBases/Infrastructure/Persistence/TypeORM/Repositories/knowledge-base.repository.ts'

export const knowledgeBasesProviders = [
  KnowledgeBaseRepository,
  {
    provide: EnsureIndexingKnowledgeBaseCommandHandler,
    useFactory: (knowledgeBases: KnowledgeBaseRepositoryContract) =>
      new EnsureIndexingKnowledgeBaseCommandHandler(knowledgeBases),
    inject: [KnowledgeBaseRepositoryContract],
  },
  {
    provide: GetIndexingKnowledgeBaseQueryHandler,
    useFactory: (knowledgeBases: KnowledgeBaseRepositoryContract) =>
      new GetIndexingKnowledgeBaseQueryHandler(knowledgeBases),
    inject: [KnowledgeBaseRepositoryContract],
  },
  {
    provide: ValidateKnowledgeBasePruningCommandHandler,
    useFactory: (knowledgeBaseRepository: KnowledgeBaseRepositoryContract) =>
      new ValidateKnowledgeBasePruningCommandHandler(knowledgeBaseRepository),
    inject: [KnowledgeBaseRepositoryContract],
  },
  {
    provide: EnsureIndexingKnowledgeBaseCommandHandlerContract,
    useExisting: EnsureIndexingKnowledgeBaseCommandHandler,
  },
  { provide: GetIndexingKnowledgeBaseQueryHandlerContract, useExisting: GetIndexingKnowledgeBaseQueryHandler },
  {
    provide: ValidateKnowledgeBasePruningCommandHandlerContract,
    useExisting: ValidateKnowledgeBasePruningCommandHandler,
  },
  { provide: KnowledgeBaseRepositoryContract, useExisting: KnowledgeBaseRepository },
]
