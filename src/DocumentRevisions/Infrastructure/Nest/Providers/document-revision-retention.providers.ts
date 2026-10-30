import { InspectDocumentIndexRetentionQueryHandlerContract } from '../../../../DocumentIndexes/Application/Contracts/inspect-document-index-retention.query.handler.contract.ts'
import { CollectDocumentRevisionGarbageCommandHandler } from '../../../Application/Commands/collect-document-revision-garbage.command.handler.ts'
import { CollectDocumentRevisionGarbageCommandHandlerContract } from '../../../Application/Contracts/collect-document-revision-garbage.command.handler.contract.ts'
import { DocumentRevisionRepository as DocumentRevisionRepositoryContract } from '../../../Application/Ports/Out/Repositories/document-revision.repository.ts'

export const documentRevisionRetentionProviders = [
  {
    provide: CollectDocumentRevisionGarbageCommandHandler,
    useFactory: (
      documentRevisionRepository: DocumentRevisionRepositoryContract,
      indexRetention: InspectDocumentIndexRetentionQueryHandlerContract,
    ) => new CollectDocumentRevisionGarbageCommandHandler(documentRevisionRepository, indexRetention),
    inject: [DocumentRevisionRepositoryContract, InspectDocumentIndexRetentionQueryHandlerContract],
  },
  {
    provide: CollectDocumentRevisionGarbageCommandHandlerContract,
    useExisting: CollectDocumentRevisionGarbageCommandHandler,
  },
]
