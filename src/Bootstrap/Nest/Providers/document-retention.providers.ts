import { InspectDocumentIndexExecutionRetentionQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/inspect-document-index-execution-retention.query.handler.contract.ts'
import { InspectDocumentIndexRetentionQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/inspect-document-index-retention.query.handler.contract.ts'
import { InspectDocumentRelationRetentionQueryHandlerContract } from '../../../DocumentRelations/Application/Contracts/inspect-document-relation-retention.query.handler.contract.ts'
import { InspectDocumentRevisionRetentionQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/inspect-document-revision-retention.query.handler.contract.ts'
import { StartDocumentPruningRetentionCommandHandler } from '../../../Documents/Application/Commands/start-document-pruning-retention.command.handler.ts'
import { StartDocumentPruningRetentionCommandHandlerContract } from '../../../Documents/Application/Contracts/start-document-pruning-retention.command.handler.contract.ts'
import { DocumentRepository as DocumentRepositoryContract } from '../../../Documents/Application/Ports/Out/Repositories/document.repository.ts'
import { InspectDocumentRetentionQueryHandler } from '../../../Documents/Application/Queries/inspect-document-retention.query.handler.ts'
import { InspectKnowledgeBaseDocumentRetentionQueryHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/inspect-knowledge-base-document-retention.query.handler.contract.ts'

export const documentRetentionProviders = [
  {
    provide: InspectDocumentRetentionQueryHandler,
    useFactory: (
      knowledgeBaseDocumentRetention: InspectKnowledgeBaseDocumentRetentionQueryHandlerContract,
      revisionRetention: InspectDocumentRevisionRetentionQueryHandlerContract,
      indexRetention: InspectDocumentIndexRetentionQueryHandlerContract,
      relationRetention: InspectDocumentRelationRetentionQueryHandlerContract,
      documentRepository: DocumentRepositoryContract,
      executionRetention: InspectDocumentIndexExecutionRetentionQueryHandlerContract,
    ) =>
      new InspectDocumentRetentionQueryHandler(
        knowledgeBaseDocumentRetention,
        revisionRetention,
        indexRetention,
        relationRetention,
        documentRepository,
        executionRetention,
      ),
    inject: [
      InspectKnowledgeBaseDocumentRetentionQueryHandlerContract,
      InspectDocumentRevisionRetentionQueryHandlerContract,
      InspectDocumentIndexRetentionQueryHandlerContract,
      InspectDocumentRelationRetentionQueryHandlerContract,
      DocumentRepositoryContract,
      InspectDocumentIndexExecutionRetentionQueryHandlerContract,
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
]
