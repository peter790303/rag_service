import { Module } from '@nestjs/common'

import { DocumentIndexesModule } from './document-indexes.module.ts'
import { documentRevisionRetentionProviders } from './document-revision-retention.providers.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { CollectDocumentRevisionGarbageCommandHandlerContract } from '../../../DocumentRevisions/Application/Contracts/collect-document-revision-garbage.command.handler.contract.ts'

@Module({
  imports: [DocumentRevisionsModule, DocumentIndexesModule],
  providers: documentRevisionRetentionProviders,
  exports: [CollectDocumentRevisionGarbageCommandHandlerContract],
})
export class DocumentRevisionRetentionModule {}
