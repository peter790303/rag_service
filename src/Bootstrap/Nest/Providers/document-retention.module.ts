import { Module } from '@nestjs/common'

import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { InspectDocumentIndexRetentionQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/inspect-document-index-retention.query.handler.contract.ts'
import { DocumentIndexExecutionQueue } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-execution.queue.ts'
import { DocumentIndexFailureArchive } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-failure.archive.ts'
import { StartDocumentPruningRetentionCommandHandler } from '../../../Documents/Application/Commands/start-document-pruning-retention.command.handler.ts'
import { InspectDocumentRelationRetentionQueryHandlerContract } from '../../../Documents/Application/Contracts/inspect-document-relation-retention.query.handler.contract.ts'
import { InspectDocumentRevisionRetentionQueryHandlerContract } from '../../../Documents/Application/Contracts/inspect-document-revision-retention.query.handler.contract.ts'
import { StartDocumentPruningRetentionCommandHandlerContract } from '../../../Documents/Application/Contracts/start-document-pruning-retention.command.handler.contract.ts'
import { DocumentRepository as DocumentRepositoryContract } from '../../../Documents/Application/Ports/Out/Repositories/document.repository.ts'
import { InspectDocumentRetentionQueryHandler } from '../../../Documents/Application/Queries/inspect-document-retention.query.handler.ts'
import { InspectKnowledgeBaseDocumentRetentionQueryHandlerContract } from '../../../KnowledgeBases/Application/Contracts/inspect-knowledge-base-document-retention.query.handler.contract.ts'

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
      provide: InspectDocumentRetentionQueryHandler,
      useFactory: (
        knowledgeBaseDocumentRetention: InspectKnowledgeBaseDocumentRetentionQueryHandlerContract,
        revisionRetention: InspectDocumentRevisionRetentionQueryHandlerContract,
        indexRetention: InspectDocumentIndexRetentionQueryHandlerContract,
        relationRetention: InspectDocumentRelationRetentionQueryHandlerContract,
        documentRepository: DocumentRepositoryContract,
        documentIndexExecutionQueue: DocumentIndexExecutionQueue,
        documentIndexFailureArchive: DocumentIndexFailureArchive,
      ) =>
        new InspectDocumentRetentionQueryHandler(
          knowledgeBaseDocumentRetention,
          revisionRetention,
          indexRetention,
          relationRetention,
          documentRepository,
          documentIndexExecutionQueue,
          documentIndexFailureArchive,
        ),
      inject: [
        InspectKnowledgeBaseDocumentRetentionQueryHandlerContract,
        InspectDocumentRevisionRetentionQueryHandlerContract,
        InspectDocumentIndexRetentionQueryHandlerContract,
        InspectDocumentRelationRetentionQueryHandlerContract,
        DocumentRepositoryContract,
        DocumentIndexExecutionQueue,
        DocumentIndexFailureArchive,
      ],
    },
    {
      provide: StartDocumentPruningRetentionCommandHandler,
      useFactory: (
        documentRepository: DocumentRepositoryContract,
        documentRetention: InspectDocumentRetentionQueryHandler,
      ) => new StartDocumentPruningRetentionCommandHandler(documentRepository, documentRetention),
      inject: [DocumentRepositoryContract, InspectDocumentRetentionQueryHandler],
    },
    {
      provide: StartDocumentPruningRetentionCommandHandlerContract,
      useExisting: StartDocumentPruningRetentionCommandHandler,
    },
  ],
  exports: [InspectDocumentRetentionQueryHandler, StartDocumentPruningRetentionCommandHandlerContract],
})
export class DocumentRetentionModule {}
