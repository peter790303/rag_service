import type { KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import { CollectIndexChunkGarbageCommandHandler } from '../../../src/Chunks/Application/Commands/collect-index-chunk-garbage.command.handler.ts'
import type { ChunkRepository } from '../../../src/Chunks/Application/Ports/Out/Repositories/chunk.repository.ts'
import { CollectDocumentIndexFailureGarbageCommandHandler } from '../../../src/DocumentIndexes/Application/Commands/collect-document-index-failure-garbage.command.handler.ts'
import { CollectDocumentIndexGarbageCommandHandler } from '../../../src/DocumentIndexes/Application/Commands/collect-document-index-garbage.command.handler.ts'
import { StartDocumentIndexPruningRetentionCommandHandler } from '../../../src/DocumentIndexes/Application/Commands/start-document-index-pruning-retention.command.handler.ts'
import { CancelKnowledgeBaseDocumentDocumentIndexingListener } from '../../../src/DocumentIndexes/Application/Listeners/cancel-knowledge-base-document-document-indexing.listener.ts'
import type { DocumentIndexExecutionQueue } from '../../../src/DocumentIndexes/Application/Ports/Out/Gateways/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../../../src/DocumentIndexes/Application/Ports/Out/Gateways/document-index-failure.archive.ts'
import type { DocumentIndexRepository } from '../../../src/DocumentIndexes/Application/Ports/Out/Repositories/document-index.repository.ts'
import { InspectDocumentIndexExecutionRetentionQueryHandler } from '../../../src/DocumentIndexes/Application/Queries/inspect-document-index-execution-retention.query.handler.ts'
import { InspectDocumentIndexRetentionQueryHandler } from '../../../src/DocumentIndexes/Application/Queries/inspect-document-index-retention.query.handler.ts'
import { PlanDocumentIndexGarbageQueryHandler } from '../../../src/DocumentIndexes/Application/Queries/plan-document-index-garbage.query.handler.ts'
import { CollectDocumentRelationGarbageCommandHandler } from '../../../src/DocumentRelations/Application/Commands/collect-document-relation-garbage.command.handler.ts'
import type { DocumentRelationRepository } from '../../../src/DocumentRelations/Application/Ports/Out/Repositories/document-relation.repository.ts'
import { InspectDocumentRelationRetentionQueryHandler } from '../../../src/DocumentRelations/Application/Queries/inspect-document-relation-retention.query.handler.ts'
import { PlanDocumentRelationGarbageQueryHandler } from '../../../src/DocumentRelations/Application/Queries/plan-document-relation-garbage.query.handler.ts'
import { CollectDocumentRevisionGarbageCommandHandler } from '../../../src/DocumentRevisions/Application/Commands/collect-document-revision-garbage.command.handler.ts'
import type { DocumentRevisionRepository } from '../../../src/DocumentRevisions/Application/Ports/Out/Repositories/document-revision.repository.ts'
import { InspectDocumentRevisionRetentionQueryHandler } from '../../../src/DocumentRevisions/Application/Queries/inspect-document-revision-retention.query.handler.ts'
import { PlanDocumentRevisionGarbageQueryHandler } from '../../../src/DocumentRevisions/Application/Queries/plan-document-revision-garbage.query.handler.ts'
import { LockDocumentRetentionParentsCommandHandler } from '../../../src/Documents/Application/Commands/lock-document-retention-parents.command.handler.ts'
import { StartDocumentPruningRetentionCommandHandler } from '../../../src/Documents/Application/Commands/start-document-pruning-retention.command.handler.ts'
import { DocumentGarbageCollectionRequestedListener } from '../../../src/Documents/Application/Listeners/document-garbage-collection-requested.listener.ts'
import type { DocumentRepository } from '../../../src/Documents/Application/Ports/Out/Repositories/document.repository.ts'
import { InspectDocumentRetentionQueryHandler } from '../../../src/Documents/Application/Queries/inspect-document-retention.query.handler.ts'
import { PruneKnowledgeBaseDocumentsCommandHandler } from '../../../src/KnowledgeBaseDocuments/Application/Commands/prune-knowledge-base-documents.command.handler.ts'
import type { KnowledgeBaseDocumentRepository } from '../../../src/KnowledgeBaseDocuments/Application/Ports/Out/Repositories/knowledge-base-document.repository.ts'
import { InspectKnowledgeBaseDocumentRetentionQueryHandler } from '../../../src/KnowledgeBaseDocuments/Application/Queries/inspect-knowledge-base-document-retention.query.handler.ts'
import { ValidateKnowledgeBasePruningCommandHandler } from '../../../src/KnowledgeBases/Application/Commands/validate-knowledge-base-pruning.command.handler.ts'
import type { KnowledgeBaseRepository } from '../../../src/KnowledgeBases/Application/Ports/Out/Repositories/knowledge-base.repository.ts'
import type { PersistenceTransaction } from '../../../src/Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'

export type GarbageCollectionTestDependencies = [
  PersistenceTransaction,
  DocumentRepository,
  KnowledgeBaseDocumentRepository,
  DocumentIndexExecutionQueue,
  DocumentIndexRepository,
  DocumentRevisionRepository,
  DocumentIndexFailureArchive,
  ChunkRepository,
  DocumentRelationRepository,
  Pick<KnowledgeServiceConfig, 'gcRetentionMs'>,
]

export type KnowledgeBaseDocumentPruningTestDependencies = [
  PersistenceTransaction,
  KnowledgeBaseRepository,
  DocumentRepository,
  KnowledgeBaseDocumentRepository,
  DocumentIndexExecutionQueue,
  DocumentIndexRepository,
  DocumentRevisionRepository,
  DocumentIndexFailureArchive,
  DocumentRelationRepository,
]

const createDocumentRetention = (
  knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository,
  documentRevisionRepository: DocumentRevisionRepository,
  documentIndexRepository: DocumentIndexRepository,
  jobRepository: DocumentIndexExecutionQueue,
  failedJobRepository: DocumentIndexFailureArchive,
  documentRelationRepository: DocumentRelationRepository,
  documentRepository: DocumentRepository,
): InspectDocumentRetentionQueryHandler =>
  new InspectDocumentRetentionQueryHandler(
    new InspectKnowledgeBaseDocumentRetentionQueryHandler(knowledgeBaseDocumentRepository),
    new InspectDocumentRevisionRetentionQueryHandler(documentRevisionRepository),
    new InspectDocumentIndexRetentionQueryHandler(documentIndexRepository),
    new InspectDocumentRelationRetentionQueryHandler(documentRelationRepository),
    documentRepository,
    new InspectDocumentIndexExecutionRetentionQueryHandler(jobRepository, failedJobRepository),
  )

export const createGarbageCollectionListener = (
  ...[
    persistenceTransaction,
    documentRepository,
    knowledgeBaseDocumentRepository,
    jobRepository,
    documentIndexRepository,
    documentRevisionRepository,
    failedJobRepository,
    chunkRepository,
    documentRelationRepository,
    config,
  ]: GarbageCollectionTestDependencies
): DocumentGarbageCollectionRequestedListener => {
  const knowledgeBaseDocumentRetention = new InspectKnowledgeBaseDocumentRetentionQueryHandler(
    knowledgeBaseDocumentRepository,
  )
  const indexRetention = new InspectDocumentIndexRetentionQueryHandler(documentIndexRepository)

  return new DocumentGarbageCollectionRequestedListener(
    persistenceTransaction,
    documentRepository,
    new PlanDocumentIndexGarbageQueryHandler(documentIndexRepository, failedJobRepository),
    new CollectDocumentIndexGarbageCommandHandler(
      documentIndexRepository,
      jobRepository,
      failedJobRepository,
      knowledgeBaseDocumentRetention,
      new CollectDocumentRelationGarbageCommandHandler(documentRelationRepository),
      new CollectIndexChunkGarbageCommandHandler(chunkRepository),
    ),
    new PlanDocumentRevisionGarbageQueryHandler(documentRevisionRepository),
    new CollectDocumentRevisionGarbageCommandHandler(documentRevisionRepository, indexRetention),
    new PlanDocumentRelationGarbageQueryHandler(documentRelationRepository),
    new LockDocumentRetentionParentsCommandHandler(documentRepository),
    createDocumentRetention(
      knowledgeBaseDocumentRepository,
      documentRevisionRepository,
      documentIndexRepository,
      jobRepository,
      failedJobRepository,
      documentRelationRepository,
      documentRepository,
    ),
    config,
    new CollectDocumentIndexFailureGarbageCommandHandler(jobRepository, failedJobRepository),
  )
}

export const createKnowledgeBaseDocumentPruningUseCase = (
  ...[
    persistenceTransaction,
    knowledgeBaseRepository,
    documentRepository,
    knowledgeBaseDocumentRepository,
    jobRepository,
    documentIndexRepository,
    documentRevisionRepository,
    failedJobRepository,
    documentRelationRepository,
  ]: KnowledgeBaseDocumentPruningTestDependencies
): PruneKnowledgeBaseDocumentsCommandHandler => {
  const knowledgeBaseDocumentRetention = new InspectKnowledgeBaseDocumentRetentionQueryHandler(
    knowledgeBaseDocumentRepository,
  )

  return new PruneKnowledgeBaseDocumentsCommandHandler(
    persistenceTransaction,
    new ValidateKnowledgeBasePruningCommandHandler(knowledgeBaseRepository),
    new LockDocumentRetentionParentsCommandHandler(documentRepository),
    knowledgeBaseDocumentRepository,
    { deliver: (event) => new CancelKnowledgeBaseDocumentDocumentIndexingListener(jobRepository).handle(event) },
    new StartDocumentIndexPruningRetentionCommandHandler(
      documentIndexRepository,
      jobRepository,
      knowledgeBaseDocumentRetention,
    ),
    new StartDocumentPruningRetentionCommandHandler(
      documentRepository,
      createDocumentRetention(
        knowledgeBaseDocumentRepository,
        documentRevisionRepository,
        documentIndexRepository,
        jobRepository,
        failedJobRepository,
        documentRelationRepository,
        documentRepository,
      ),
    ),
  )
}
