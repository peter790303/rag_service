import { Module } from '@nestjs/common'

import { PersistenceModule } from './persistence.module.ts'
import { EnsureIndexingKnowledgeBaseCommandHandlerContract } from '../../../KnowledgeBases/Application/Contracts/ensure-indexing-knowledge-base.command.handler.contract.ts'
import { GetIndexingKnowledgeBaseQueryHandlerContract } from '../../../KnowledgeBases/Application/Contracts/get-indexing-knowledge-base.query.handler.contract.ts'
import { ValidateKnowledgeBasePruningCommandHandlerContract } from '../../../KnowledgeBases/Application/Contracts/validate-knowledge-base-pruning.command.handler.contract.ts'
import { KnowledgeBaseRepository as KnowledgeBaseRepositoryContract } from '../../../KnowledgeBases/Application/Ports/Out/Repositories/knowledge-base.repository.ts'
import { knowledgeBasesProviders } from '../../../KnowledgeBases/Infrastructure/Nest/Providers/knowledge-bases.providers.ts'

@Module({
  imports: [PersistenceModule],
  providers: knowledgeBasesProviders,
  exports: [
    EnsureIndexingKnowledgeBaseCommandHandlerContract,
    GetIndexingKnowledgeBaseQueryHandlerContract,
    ValidateKnowledgeBasePruningCommandHandlerContract,
    KnowledgeBaseRepositoryContract,
  ],
})
export class KnowledgeBasesModule {}
