import { Module } from '@nestjs/common'

import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { InspectDocumentIndexRetentionUseCaseContract } from '../../Application/DocumentIndexes/Contracts/inspect-document-index-retention.use-case.contract.ts'
import { CollectDocumentRevisionGarbageUseCaseContract } from '../../Application/DocumentRevisions/Contracts/collect-document-revision-garbage.use-case.contract.ts'
import { DocumentRevisionRepository as DocumentRevisionRepositoryContract } from '../../Application/DocumentRevisions/Contracts/document-revision.repository.ts'
import { CollectDocumentRevisionGarbageUseCase } from '../../Application/DocumentRevisions/UseCases/collect-document-revision-garbage.use-case.ts'

@Module({
  imports: [DocumentRevisionsModule, DocumentIndexesModule],
  providers: [
    {
      provide: CollectDocumentRevisionGarbageUseCase,
      useFactory: (
        documentRevisionRepository: DocumentRevisionRepositoryContract,
        indexRetention: InspectDocumentIndexRetentionUseCaseContract,
      ) => new CollectDocumentRevisionGarbageUseCase(documentRevisionRepository, indexRetention),
      inject: [DocumentRevisionRepositoryContract, InspectDocumentIndexRetentionUseCaseContract],
    },
    { provide: CollectDocumentRevisionGarbageUseCaseContract, useExisting: CollectDocumentRevisionGarbageUseCase },
  ],
  exports: [CollectDocumentRevisionGarbageUseCaseContract],
})
export class DocumentRevisionRetentionModule {}
