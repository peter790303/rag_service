import { Module } from '@nestjs/common'

import { DocumentIndexesModule } from './document-indexes.module.ts'
import { DocumentRevisionsModule } from './document-revisions.module.ts'
import { DocumentsModule } from './documents.module.ts'
import { KnowledgeBaseDocumentsModule } from './knowledge-base-documents.module.ts'
import { KnowledgeBasesModule } from './knowledge-bases.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { LoadRetrievalDocumentIndexesUseCaseContract } from '../../Application/DocumentIndexes/Contracts/load-retrieval-document-indexes.use-case.contract.ts'
import { LoadRetrievalDocumentRevisionsUseCaseContract } from '../../Application/DocumentRevisions/Contracts/load-retrieval-document-revisions.use-case.contract.ts'
import { LoadRetrievalDocumentsUseCaseContract } from '../../Application/Documents/Contracts/load-retrieval-documents.use-case.contract.ts'
import { LoadRetrievalKnowledgeBaseDocumentsUseCaseContract } from '../../Application/KnowledgeBaseDocuments/Contracts/load-retrieval-knowledge-base-documents.use-case.contract.ts'
import { KnowledgeBaseRepository } from '../../Application/KnowledgeBases/Contracts/knowledge-base.repository.ts'
import { PersistenceTransaction } from '../../Application/KnowledgeBases/Contracts/persistence-transaction.ts'
import { LoadIndexManifestUseCase } from '../../Application/KnowledgeBases/UseCases/load-index-manifest.use-case.ts'

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
      provide: LoadIndexManifestUseCase,
      useFactory: (
        transaction: PersistenceTransaction,
        knowledgeBases: KnowledgeBaseRepository,
        memberships: LoadRetrievalKnowledgeBaseDocumentsUseCaseContract,
        documents: LoadRetrievalDocumentsUseCaseContract,
        indexes: LoadRetrievalDocumentIndexesUseCaseContract,
        revisions: LoadRetrievalDocumentRevisionsUseCaseContract,
      ) => new LoadIndexManifestUseCase(transaction, knowledgeBases, memberships, documents, indexes, revisions),
      inject: [
        PersistenceTransaction,
        KnowledgeBaseRepository,
        LoadRetrievalKnowledgeBaseDocumentsUseCaseContract,
        LoadRetrievalDocumentsUseCaseContract,
        LoadRetrievalDocumentIndexesUseCaseContract,
        LoadRetrievalDocumentRevisionsUseCaseContract,
      ],
    },
  ],
  exports: [LoadIndexManifestUseCase],
})
export class IndexManifestModule {}
