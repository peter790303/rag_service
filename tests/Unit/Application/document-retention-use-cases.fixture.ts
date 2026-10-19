import type { KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import type { ChunkRepository } from '../../../src/Application/Chunks/Contracts/chunk.repository.ts'
import { CollectIndexChunkGarbageUseCase } from '../../../src/Application/Chunks/UseCases/collect-index-chunk-garbage.use-case.ts'
import type { DocumentIndexExecutionQueue } from '../../../src/Application/DocumentIndexes/Contracts/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../../../src/Application/DocumentIndexes/Contracts/document-index-failure.archive.ts'
import type { DocumentIndexRepository } from '../../../src/Application/DocumentIndexes/Contracts/document-index.repository.ts'
import { CancelKnowledgeBaseDocumentDocumentIndexingListener } from '../../../src/Application/DocumentIndexes/Listeners/cancel-knowledge-base-document-document-indexing.listener.ts'
import { CollectDocumentIndexGarbageUseCase } from '../../../src/Application/DocumentIndexes/UseCases/collect-document-index-garbage.use-case.ts'
import { InspectDocumentIndexRetentionUseCase } from '../../../src/Application/DocumentIndexes/UseCases/inspect-document-index-retention.use-case.ts'
import { PlanDocumentIndexGarbageUseCase } from '../../../src/Application/DocumentIndexes/UseCases/plan-document-index-garbage.use-case.ts'
import { StartDocumentIndexPruningRetentionUseCase } from '../../../src/Application/DocumentIndexes/UseCases/start-document-index-pruning-retention.use-case.ts'
import type { DocumentRelationRepository } from '../../../src/Application/DocumentRelations/Contracts/document-relation.repository.ts'
import { CollectDocumentRelationGarbageUseCase } from '../../../src/Application/DocumentRelations/UseCases/collect-document-relation-garbage.use-case.ts'
import { InspectDocumentRelationRetentionUseCase } from '../../../src/Application/DocumentRelations/UseCases/inspect-document-relation-retention.use-case.ts'
import { PlanDocumentRelationGarbageUseCase } from '../../../src/Application/DocumentRelations/UseCases/plan-document-relation-garbage.use-case.ts'
import type { DocumentRevisionRepository } from '../../../src/Application/DocumentRevisions/Contracts/document-revision.repository.ts'
import { CollectDocumentRevisionGarbageUseCase } from '../../../src/Application/DocumentRevisions/UseCases/collect-document-revision-garbage.use-case.ts'
import { InspectDocumentRevisionRetentionUseCase } from '../../../src/Application/DocumentRevisions/UseCases/inspect-document-revision-retention.use-case.ts'
import { PlanDocumentRevisionGarbageUseCase } from '../../../src/Application/DocumentRevisions/UseCases/plan-document-revision-garbage.use-case.ts'
import type { DocumentRepository } from '../../../src/Application/Documents/Contracts/document.repository.ts'
import { DocumentGarbageCollectionRequestedListener } from '../../../src/Application/Documents/Listeners/document-garbage-collection-requested.listener.ts'
import { InspectDocumentRetentionUseCase } from '../../../src/Application/Documents/UseCases/inspect-document-retention.use-case.ts'
import { LockDocumentRetentionParentsUseCase } from '../../../src/Application/Documents/UseCases/lock-document-retention-parents.use-case.ts'
import { StartDocumentPruningRetentionUseCase } from '../../../src/Application/Documents/UseCases/start-document-pruning-retention.use-case.ts'
import type { KnowledgeBaseDocumentRepository } from '../../../src/Application/KnowledgeBaseDocuments/Contracts/knowledge-base-document.repository.ts'
import { InspectKnowledgeBaseDocumentRetentionUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/inspect-knowledge-base-document-retention.use-case.ts'
import { PruneKnowledgeBaseDocumentsUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/prune-knowledge-base-documents.use-case.ts'
import type { KnowledgeBaseRepository } from '../../../src/Application/KnowledgeBases/Contracts/knowledge-base.repository.ts'
import type { PersistenceTransaction } from '../../../src/Application/KnowledgeBases/Contracts/persistence-transaction.ts'
import { ValidateKnowledgeBasePruningUseCase } from '../../../src/Application/KnowledgeBases/UseCases/validate-knowledge-base-pruning.use-case.ts'

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
): InspectDocumentRetentionUseCase =>
  new InspectDocumentRetentionUseCase(
    new InspectKnowledgeBaseDocumentRetentionUseCase(knowledgeBaseDocumentRepository),
    new InspectDocumentRevisionRetentionUseCase(documentRevisionRepository),
    new InspectDocumentIndexRetentionUseCase(documentIndexRepository),
    new InspectDocumentRelationRetentionUseCase(documentRelationRepository),
    documentRepository,
    jobRepository,
    failedJobRepository,
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
  const knowledgeBaseDocumentRetention = new InspectKnowledgeBaseDocumentRetentionUseCase(
    knowledgeBaseDocumentRepository,
  )
  const indexRetention = new InspectDocumentIndexRetentionUseCase(documentIndexRepository)

  return new DocumentGarbageCollectionRequestedListener(
    persistenceTransaction,
    documentRepository,
    new PlanDocumentIndexGarbageUseCase(documentIndexRepository),
    new CollectDocumentIndexGarbageUseCase(
      documentIndexRepository,
      jobRepository,
      failedJobRepository,
      knowledgeBaseDocumentRetention,
      new CollectDocumentRelationGarbageUseCase(documentRelationRepository),
      new CollectIndexChunkGarbageUseCase(chunkRepository),
    ),
    new PlanDocumentRevisionGarbageUseCase(documentRevisionRepository),
    new CollectDocumentRevisionGarbageUseCase(documentRevisionRepository, indexRetention),
    new PlanDocumentRelationGarbageUseCase(documentRelationRepository),
    new LockDocumentRetentionParentsUseCase(documentRepository),
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
    jobRepository,
    failedJobRepository,
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
): PruneKnowledgeBaseDocumentsUseCase => {
  const knowledgeBaseDocumentRetention = new InspectKnowledgeBaseDocumentRetentionUseCase(
    knowledgeBaseDocumentRepository,
  )

  return new PruneKnowledgeBaseDocumentsUseCase(
    persistenceTransaction,
    new ValidateKnowledgeBasePruningUseCase(knowledgeBaseRepository),
    new LockDocumentRetentionParentsUseCase(documentRepository),
    knowledgeBaseDocumentRepository,
    { deliver: (event) => new CancelKnowledgeBaseDocumentDocumentIndexingListener(jobRepository).handle(event) },
    new StartDocumentIndexPruningRetentionUseCase(
      documentIndexRepository,
      jobRepository,
      knowledgeBaseDocumentRetention,
    ),
    new StartDocumentPruningRetentionUseCase(
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
