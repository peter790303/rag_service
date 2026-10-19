import { Module } from '@nestjs/common'

import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { DocumentIndexExecutionQueue } from '../../Application/DocumentIndexes/Contracts/document-index-execution.queue.ts'
import { DocumentIndexFailureArchive } from '../../Application/DocumentIndexes/Contracts/document-index-failure.archive.ts'
import { InspectDocumentIndexRetentionUseCaseContract } from '../../Application/DocumentIndexes/Contracts/inspect-document-index-retention.use-case.contract.ts'
import { InspectDocumentRelationRetentionUseCaseContract } from '../../Application/DocumentRelations/Contracts/inspect-document-relation-retention.use-case.contract.ts'
import { InspectDocumentRevisionRetentionUseCaseContract } from '../../Application/DocumentRevisions/Contracts/inspect-document-revision-retention.use-case.contract.ts'
import { DocumentRepository as DocumentRepositoryContract } from '../../Application/Documents/Contracts/document.repository.ts'
import { StartDocumentPruningRetentionUseCaseContract } from '../../Application/Documents/Contracts/start-document-pruning-retention.use-case.contract.ts'
import { InspectDocumentRetentionUseCase } from '../../Application/Documents/UseCases/inspect-document-retention.use-case.ts'
import { StartDocumentPruningRetentionUseCase } from '../../Application/Documents/UseCases/start-document-pruning-retention.use-case.ts'
import { InspectKnowledgeBaseDocumentRetentionUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/inspect-knowledge-base-document-retention.use-case.contract.ts'

@Module({
  imports: [
    KnowledgeBaseDocumentsModule,
    DocumentRevisionsModule,
    DocumentIndexesModule,
    DocumentRelationsModule,
    DocumentsModule,
  ],
  providers: [
    {
      provide: InspectDocumentRetentionUseCase,
      useFactory: (
        knowledgeBaseDocumentRetention: InspectKnowledgeBaseDocumentRetentionUseCaseContract,
        revisionRetention: InspectDocumentRevisionRetentionUseCaseContract,
        indexRetention: InspectDocumentIndexRetentionUseCaseContract,
        relationRetention: InspectDocumentRelationRetentionUseCaseContract,
        documentRepository: DocumentRepositoryContract,
        documentIndexExecutionQueue: DocumentIndexExecutionQueue,
        documentIndexFailureArchive: DocumentIndexFailureArchive,
      ) =>
        new InspectDocumentRetentionUseCase(
          knowledgeBaseDocumentRetention,
          revisionRetention,
          indexRetention,
          relationRetention,
          documentRepository,
          documentIndexExecutionQueue,
          documentIndexFailureArchive,
        ),
      inject: [
        InspectKnowledgeBaseDocumentRetentionUseCaseContract,
        InspectDocumentRevisionRetentionUseCaseContract,
        InspectDocumentIndexRetentionUseCaseContract,
        InspectDocumentRelationRetentionUseCaseContract,
        DocumentRepositoryContract,
        DocumentIndexExecutionQueue,
        DocumentIndexFailureArchive,
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
