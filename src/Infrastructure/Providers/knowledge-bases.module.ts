import { Module } from '@nestjs/common'

import { PersistenceModule } from './persistence.module.ts'
import { EnsureIndexingKnowledgeBaseUseCaseContract } from '../../Application/KnowledgeBases/Contracts/ensure-indexing-knowledge-base.use-case.contract.ts'
import { GetIndexingKnowledgeBaseUseCaseContract } from '../../Application/KnowledgeBases/Contracts/get-indexing-knowledge-base.use-case.contract.ts'
import { KnowledgeBaseRepository as KnowledgeBaseRepositoryContract } from '../../Application/KnowledgeBases/Contracts/knowledge-base.repository.ts'
import { ValidateKnowledgeBasePruningUseCaseContract } from '../../Application/KnowledgeBases/Contracts/validate-knowledge-base-pruning.use-case.contract.ts'
import { EnsureIndexingKnowledgeBaseUseCase } from '../../Application/KnowledgeBases/UseCases/ensure-indexing-knowledge-base.use-case.ts'
import { GetIndexingKnowledgeBaseUseCase } from '../../Application/KnowledgeBases/UseCases/get-indexing-knowledge-base.use-case.ts'
import { ValidateKnowledgeBasePruningUseCase } from '../../Application/KnowledgeBases/UseCases/validate-knowledge-base-pruning.use-case.ts'
import { KnowledgeBaseRepository } from '../Persistence/Repositories/knowledge-base.repository.ts'

@Module({
  imports: [PersistenceModule],
  providers: [
    KnowledgeBaseRepository,
    {
      provide: EnsureIndexingKnowledgeBaseUseCase,
      useFactory: (knowledgeBases: KnowledgeBaseRepositoryContract) =>
        new EnsureIndexingKnowledgeBaseUseCase(knowledgeBases),
      inject: [KnowledgeBaseRepositoryContract],
    },
    {
      provide: GetIndexingKnowledgeBaseUseCase,
      useFactory: (knowledgeBases: KnowledgeBaseRepositoryContract) =>
        new GetIndexingKnowledgeBaseUseCase(knowledgeBases),
      inject: [KnowledgeBaseRepositoryContract],
    },
    {
      provide: ValidateKnowledgeBasePruningUseCase,
      useFactory: (knowledgeBaseRepository: KnowledgeBaseRepositoryContract) =>
        new ValidateKnowledgeBasePruningUseCase(knowledgeBaseRepository),
      inject: [KnowledgeBaseRepositoryContract],
    },
    { provide: EnsureIndexingKnowledgeBaseUseCaseContract, useExisting: EnsureIndexingKnowledgeBaseUseCase },
    { provide: GetIndexingKnowledgeBaseUseCaseContract, useExisting: GetIndexingKnowledgeBaseUseCase },
    { provide: ValidateKnowledgeBasePruningUseCaseContract, useExisting: ValidateKnowledgeBasePruningUseCase },
    { provide: KnowledgeBaseRepositoryContract, useExisting: KnowledgeBaseRepository },
  ],
  exports: [
    EnsureIndexingKnowledgeBaseUseCaseContract,
    GetIndexingKnowledgeBaseUseCaseContract,
    ValidateKnowledgeBasePruningUseCaseContract,
    KnowledgeBaseRepositoryContract,
  ],
})
export class KnowledgeBasesModule {}
