import { Module } from '@nestjs/common'

import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { CollectDocumentRevisionGarbageCommandHandlerContract } from '../../../DocumentRevisions/Application/Contracts/collect-document-revision-garbage.command.handler.contract.ts'
import { documentRevisionRetentionProviders } from '../../../DocumentRevisions/Infrastructure/Nest/Providers/document-revision-retention.providers.ts'

@Module({
  imports: [DocumentRevisionsModule, DocumentIndexesModule],
  providers: documentRevisionRetentionProviders,
  exports: [CollectDocumentRevisionGarbageCommandHandlerContract],
})
export class DocumentRevisionRetentionModule {}
