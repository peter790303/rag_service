import { EnsureIndexingKnowledgeBaseCommandHandler } from '../../../Application/Commands/ensure-indexing-knowledge-base.command.handler.ts'
import { ValidateKnowledgeBasePruningCommandHandler } from '../../../Application/Commands/validate-knowledge-base-pruning.command.handler.ts'
import { EnsureIndexingKnowledgeBaseCommandHandlerContract } from '../../../Application/Contracts/ensure-indexing-knowledge-base.command.handler.contract.ts'
import { GetIndexingKnowledgeBaseQueryHandlerContract } from '../../../Application/Contracts/get-indexing-knowledge-base.query.handler.contract.ts'
import { ValidateKnowledgeBasePruningCommandHandlerContract } from '../../../Application/Contracts/validate-knowledge-base-pruning.command.handler.contract.ts'
import { KnowledgeBaseRepository as KnowledgeBaseRepositoryContract } from '../../../Application/Ports/Out/Repositories/knowledge-base.repository.ts'
import { GetIndexingKnowledgeBaseQueryHandler } from '../../../Application/Queries/get-indexing-knowledge-base.query.handler.ts'
import { KnowledgeBaseRepository } from '../../Persistence/TypeORM/Repositories/knowledge-base.repository.ts'

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
