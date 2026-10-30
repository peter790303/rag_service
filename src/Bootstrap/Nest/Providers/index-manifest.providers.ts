import { LoadRetrievalDocumentIndexesQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/load-retrieval-document-indexes.query.handler.contract.ts'
import { LoadRetrievalDocumentRevisionsQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/load-retrieval-document-revisions.query.handler.contract.ts'
import { LoadRetrievalDocumentsQueryHandlerContract } from '../../../Documents/Application/Contracts/load-retrieval-documents.query.handler.contract.ts'
import { LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/load-retrieval-knowledge-base-documents.query.handler.contract.ts'
import { KnowledgeBaseRepository } from '../../../KnowledgeBases/Application/Ports/Out/Repositories/knowledge-base.repository.ts'
import { LoadIndexManifestQueryHandler } from '../../../KnowledgeBases/Application/Queries/load-index-manifest.query.handler.ts'
import { PersistenceTransaction } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'

export const indexManifestProviders = [
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
]
