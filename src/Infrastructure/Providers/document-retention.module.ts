import { Module } from '@nestjs/common'

import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { MembershipsModule } from './memberships.module.ts'
import { InspectDocumentIndexRetentionUseCaseContract } from '../../Application/DocumentIndexes/Contracts/inspect-document-index-retention.use-case.contract.ts'
import { InspectDocumentRelationRetentionUseCaseContract } from '../../Application/DocumentRelations/Contracts/inspect-document-relation-retention.use-case.contract.ts'
import { InspectDocumentRevisionRetentionUseCaseContract } from '../../Application/DocumentRevisions/Contracts/inspect-document-revision-retention.use-case.contract.ts'
import { DocumentRepository as DocumentRepositoryContract } from '../../Application/Documents/Contracts/document.repository.ts'
import { StartDocumentPruningRetentionUseCaseContract } from '../../Application/Documents/Contracts/start-document-pruning-retention.use-case.contract.ts'
import { InspectDocumentRetentionUseCase } from '../../Application/Documents/UseCases/inspect-document-retention.use-case.ts'
import { StartDocumentPruningRetentionUseCase } from '../../Application/Documents/UseCases/start-document-pruning-retention.use-case.ts'
import { InspectMembershipRetentionUseCaseContract } from '../../Application/Memberships/Contracts/inspect-membership-retention.use-case.contract.ts'

@Module({
  imports: [
    MembershipsModule,
    DocumentRevisionsModule,
    DocumentIndexesModule,
    DocumentRelationsModule,
    DocumentsModule,
  ],
  providers: [
    {
      provide: InspectDocumentRetentionUseCase,
      useFactory: (
        membershipRetention: InspectMembershipRetentionUseCaseContract,
        revisionRetention: InspectDocumentRevisionRetentionUseCaseContract,
        indexRetention: InspectDocumentIndexRetentionUseCaseContract,
        relationRetention: InspectDocumentRelationRetentionUseCaseContract,
        documentRepository: DocumentRepositoryContract,
      ) =>
        new InspectDocumentRetentionUseCase(
          membershipRetention,
          revisionRetention,
          indexRetention,
          relationRetention,
          documentRepository,
        ),
      inject: [
        InspectMembershipRetentionUseCaseContract,
        InspectDocumentRevisionRetentionUseCaseContract,
        InspectDocumentIndexRetentionUseCaseContract,
        InspectDocumentRelationRetentionUseCaseContract,
        DocumentRepositoryContract,
      ],
    },
    {
      provide: StartDocumentPruningRetentionUseCase,
      useFactory: (
        documentRepository: DocumentRepositoryContract,
        documentRetention: InspectDocumentRetentionUseCase,
      ) => new StartDocumentPruningRetentionUseCase(documentRepository, documentRetention),
      inject: [DocumentRepositoryContract, InspectDocumentRetentionUseCase],
    },
    { provide: StartDocumentPruningRetentionUseCaseContract, useExisting: StartDocumentPruningRetentionUseCase },
  ],
  exports: [InspectDocumentRetentionUseCase, StartDocumentPruningRetentionUseCaseContract],
})
export class DocumentRetentionModule {}
