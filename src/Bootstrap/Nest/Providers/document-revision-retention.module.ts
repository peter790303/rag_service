import { Module } from '@nestjs/common'

import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { InspectDocumentIndexRetentionQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/inspect-document-index-retention.query.handler.contract.ts'
import { CollectDocumentRevisionGarbageCommandHandler } from '../../../Documents/Application/Commands/collect-document-revision-garbage.command.handler.ts'
import { CollectDocumentRevisionGarbageCommandHandlerContract } from '../../../Documents/Application/Contracts/collect-document-revision-garbage.command.handler.contract.ts'
import { DocumentRevisionRepository as DocumentRevisionRepositoryContract } from '../../../Documents/Application/Ports/Out/Repositories/document-revision.repository.ts'

@Module({
  imports: [DocumentRevisionsModule, DocumentIndexesModule],
  providers: [
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
  ],
  exports: [CollectDocumentRevisionGarbageCommandHandlerContract],
})
export class DocumentRevisionRetentionModule {}
