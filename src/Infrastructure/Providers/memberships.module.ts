import { Module } from '@nestjs/common'

import { PersistenceModule } from './persistence.module.ts'
import { ActivateMembershipIndexUseCaseContract } from '../../Application/Memberships/Contracts/activate-membership-index.use-case.contract.ts'
import { CompleteMembershipIndexingUseCaseContract } from '../../Application/Memberships/Contracts/complete-membership-indexing.use-case.contract.ts'
import { GetMembershipIndexingStateUseCaseContract } from '../../Application/Memberships/Contracts/get-membership-indexing-state.use-case.contract.ts'
import { InspectMembershipRetentionUseCaseContract } from '../../Application/Memberships/Contracts/inspect-membership-retention.use-case.contract.ts'
import { LoadRetrievalMembershipsUseCaseContract } from '../../Application/Memberships/Contracts/load-retrieval-memberships.use-case.contract.ts'
import { MembershipRepository } from '../../Application/Memberships/Contracts/membership.repository.ts'
import { PrepareMembershipForIndexRequestUseCaseContract } from '../../Application/Memberships/Contracts/prepare-membership-for-index-request.use-case.contract.ts'
import { ReserveMembershipForIndexingUseCaseContract } from '../../Application/Memberships/Contracts/reserve-membership-for-indexing.use-case.contract.ts'
import { SaveMembershipIndexRequestUseCaseContract } from '../../Application/Memberships/Contracts/save-membership-index-request.use-case.contract.ts'
import { ActivateMembershipIndexUseCase } from '../../Application/Memberships/UseCases/activate-membership-index.use-case.ts'
import { CompleteMembershipIndexingUseCase } from '../../Application/Memberships/UseCases/complete-membership-indexing.use-case.ts'
import { GetMembershipIndexingStateUseCase } from '../../Application/Memberships/UseCases/get-membership-indexing-state.use-case.ts'
import { InspectMembershipRetentionUseCase } from '../../Application/Memberships/UseCases/inspect-membership-retention.use-case.ts'
import { LoadRetrievalMembershipsUseCase } from '../../Application/Memberships/UseCases/load-retrieval-memberships.use-case.ts'
import { PrepareMembershipForIndexRequestUseCase } from '../../Application/Memberships/UseCases/prepare-membership-for-index-request.use-case.ts'
import { ReserveMembershipForIndexingUseCase } from '../../Application/Memberships/UseCases/reserve-membership-for-indexing.use-case.ts'
import { SaveMembershipIndexRequestUseCase } from '../../Application/Memberships/UseCases/save-membership-index-request.use-case.ts'
import { KnowledgeBaseDocumentMembershipRepository } from '../Persistence/Repositories/knowledge-base-document-membership.repository.ts'

@Module({
  imports: [PersistenceModule],
  providers: [
    KnowledgeBaseDocumentMembershipRepository,
    {
      provide: ActivateMembershipIndexUseCase,
      useFactory: (memberships: MembershipRepository) => new ActivateMembershipIndexUseCase(memberships),
      inject: [MembershipRepository],
    },
    {
      provide: CompleteMembershipIndexingUseCase,
      useFactory: (memberships: MembershipRepository) => new CompleteMembershipIndexingUseCase(memberships),
      inject: [MembershipRepository],
    },
    {
      provide: GetMembershipIndexingStateUseCase,
      useFactory: (memberships: MembershipRepository) => new GetMembershipIndexingStateUseCase(memberships),
      inject: [MembershipRepository],
    },
    {
      provide: InspectMembershipRetentionUseCase,
      useFactory: (membershipRepository: MembershipRepository) =>
        new InspectMembershipRetentionUseCase(membershipRepository),
      inject: [MembershipRepository],
    },
    {
      provide: LoadRetrievalMembershipsUseCase,
      useFactory: (repository: MembershipRepository) => new LoadRetrievalMembershipsUseCase(repository),
      inject: [MembershipRepository],
    },
    {
      provide: PrepareMembershipForIndexRequestUseCase,
      useFactory: (memberships: MembershipRepository) => new PrepareMembershipForIndexRequestUseCase(memberships),
      inject: [MembershipRepository],
    },
    {
      provide: ReserveMembershipForIndexingUseCase,
      useFactory: (memberships: MembershipRepository) => new ReserveMembershipForIndexingUseCase(memberships),
      inject: [MembershipRepository],
    },
    {
      provide: SaveMembershipIndexRequestUseCase,
      useFactory: (memberships: MembershipRepository) => new SaveMembershipIndexRequestUseCase(memberships),
      inject: [MembershipRepository],
    },
    { provide: ActivateMembershipIndexUseCaseContract, useExisting: ActivateMembershipIndexUseCase },
    { provide: CompleteMembershipIndexingUseCaseContract, useExisting: CompleteMembershipIndexingUseCase },
    { provide: GetMembershipIndexingStateUseCaseContract, useExisting: GetMembershipIndexingStateUseCase },
    { provide: InspectMembershipRetentionUseCaseContract, useExisting: InspectMembershipRetentionUseCase },
    { provide: LoadRetrievalMembershipsUseCaseContract, useExisting: LoadRetrievalMembershipsUseCase },
    { provide: PrepareMembershipForIndexRequestUseCaseContract, useExisting: PrepareMembershipForIndexRequestUseCase },
    { provide: ReserveMembershipForIndexingUseCaseContract, useExisting: ReserveMembershipForIndexingUseCase },
    { provide: SaveMembershipIndexRequestUseCaseContract, useExisting: SaveMembershipIndexRequestUseCase },
    { provide: MembershipRepository, useExisting: KnowledgeBaseDocumentMembershipRepository },
  ],
  exports: [
    ReserveMembershipForIndexingUseCaseContract,
    ActivateMembershipIndexUseCaseContract,
    CompleteMembershipIndexingUseCaseContract,
    GetMembershipIndexingStateUseCaseContract,
    PrepareMembershipForIndexRequestUseCaseContract,
    SaveMembershipIndexRequestUseCaseContract,
    InspectMembershipRetentionUseCaseContract,
    MembershipRepository,
    LoadRetrievalMembershipsUseCaseContract,
  ],
})
export class MembershipsModule {}
