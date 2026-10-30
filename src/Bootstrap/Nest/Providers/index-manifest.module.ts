import { Module } from '@nestjs/common'

import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { KnowledgeBasesModule } from './knowledge-bases.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { LoadRetrievalDocumentIndexesQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/load-retrieval-document-indexes.query.handler.contract.ts'
import { LoadRetrievalDocumentRevisionsQueryHandlerContract } from '../../../Documents/Application/Contracts/load-retrieval-document-revisions.query.handler.contract.ts'
import { LoadRetrievalDocumentsQueryHandlerContract } from '../../../Documents/Application/Contracts/load-retrieval-documents.query.handler.contract.ts'
import { LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract } from '../../../KnowledgeBases/Application/Contracts/load-retrieval-knowledge-base-documents.query.handler.contract.ts'
import { KnowledgeBaseRepository } from '../../../KnowledgeBases/Application/Ports/Out/Repositories/knowledge-base.repository.ts'
import { LoadIndexManifestQueryHandler } from '../../../KnowledgeBases/Application/Queries/load-index-manifest.query.handler.ts'
import { PersistenceTransaction } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'

@Module({
  imports: [
    PersistenceModule,
    KnowledgeBasesModule,
    KnowledgeBaseDocumentsModule,
    DocumentsModule,
    DocumentIndexesModule,
    DocumentRevisionsModule,
  ],
  providers: [
    {
      provide: LoadIndexManifestQueryHandler,
      useFactory: (
        transaction: PersistenceTransaction,
        knowledgeBases: KnowledgeBaseRepository,
        memberships: LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract,
        documents: LoadRetrievalDocumentsQueryHandlerContract,
        indexes: LoadRetrievalDocumentIndexesQueryHandlerContract,
        revisions: LoadRetrievalDocumentRevisionsQueryHandlerContract,
      ) => new LoadIndexManifestQueryHandler(transaction, knowledgeBases, memberships, documents, indexes, revisions),
      inject: [
        PersistenceTransaction,
        KnowledgeBaseRepository,
        LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract,
        LoadRetrievalDocumentsQueryHandlerContract,
        LoadRetrievalDocumentIndexesQueryHandlerContract,
        LoadRetrievalDocumentRevisionsQueryHandlerContract,
      ],
    },
  ],
  exports: [LoadIndexManifestQueryHandler],
})
export class IndexManifestModule {}
