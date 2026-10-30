import { Module } from '@nestjs/common'

import { DocumentIndexRetentionModule } from './document-index-retention.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { StartDocumentPruningRetentionCommandHandlerContract } from '../../../Documents/Application/Contracts/start-document-pruning-retention.command.handler.contract.ts'
import { InspectDocumentRetentionQueryHandler } from '../../../Documents/Application/Queries/inspect-document-retention.query.handler.ts'
import { documentRetentionProviders } from '../../../Documents/Infrastructure/Nest/Providers/document-retention.providers.ts'

@Module({
  imports: [
    KnowledgeBaseDocumentsModule,
    DocumentRevisionsModule,
    DocumentIndexesModule,
    DocumentIndexRetentionModule,
    DocumentRelationsModule,
    DocumentsModule,
  ],
  providers: documentRetentionProviders,
  exports: [InspectDocumentRetentionQueryHandler, StartDocumentPruningRetentionCommandHandlerContract],
})
export class DocumentRetentionModule {}
