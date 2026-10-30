import { Module } from '@nestjs/common'

import { DocumentIndexRetentionModule } from './document-index-retention.module.ts'
import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRetentionModule } from './document-retention.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { knowledgeBaseDocumentPruningProviders } from './knowledge-base-document-pruning.providers.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { KnowledgeBasesModule } from './knowledge-bases.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { PruneKnowledgeBaseDocumentsCommandHandler } from '../../../KnowledgeBaseDocuments/Application/Commands/prune-knowledge-base-documents.command.handler.ts'

@Module({
  imports: [
    PersistenceModule,
    KnowledgeBasesModule,
    DocumentsModule,
    KnowledgeBaseDocumentsModule,
    DocumentIndexesModule,
    DocumentIndexRetentionModule,
    DocumentRetentionModule,
  ],
  providers: knowledgeBaseDocumentPruningProviders,
  exports: [PruneKnowledgeBaseDocumentsCommandHandler],
})
export class KnowledgeBaseDocumentPruningModule {}
