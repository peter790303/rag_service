import type { KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import type { ChunkRepository } from '../../../src/Application/Chunks/Contracts/chunk.repository.ts'
import { CollectIndexChunkGarbageUseCase } from '../../../src/Application/Chunks/UseCases/collect-index-chunk-garbage.use-case.ts'
import type { DocumentIndexExecutionQueue } from '../../../src/Application/DocumentIndexes/Contracts/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../../../src/Application/DocumentIndexes/Contracts/document-index-failure.archive.ts'
import type { DocumentIndexRepository } from '../../../src/Application/DocumentIndexes/Contracts/document-index.repository.ts'
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
import type { KnowledgeBaseRepository } from '../../../src/Application/KnowledgeBases/Contracts/knowledge-base.repository.ts'
import type { PersistenceTransaction } from '../../../src/Application/KnowledgeBases/Contracts/persistence-transaction.ts'
import { ValidateKnowledgeBasePruningUseCase } from '../../../src/Application/KnowledgeBases/UseCases/validate-knowledge-base-pruning.use-case.ts'
import type { MembershipRepository } from '../../../src/Application/Memberships/Contracts/membership.repository.ts'
import { CancelMembershipIndexingListener } from '../../../src/Application/Memberships/Listeners/cancel-membership-indexing.listener.ts'
import { InspectMembershipRetentionUseCase } from '../../../src/Application/Memberships/UseCases/inspect-membership-retention.use-case.ts'
import { PruneKnowledgeBaseMembershipsUseCase } from '../../../src/Application/Memberships/UseCases/prune-knowledge-base-memberships.use-case.ts'

export type GarbageCollectionTestDependencies = [
  PersistenceTransaction,
  DocumentRepository,
  MembershipRepository,
  DocumentIndexExecutionQueue,
  DocumentIndexRepository,
  DocumentRevisionRepository,
  DocumentIndexFailureArchive,
  ChunkRepository,
  DocumentRelationRepository,
  Pick<KnowledgeServiceConfig, 'gcRetentionMs'>,
]

export type MembershipPruningTestDependencies = [
  PersistenceTransaction,
  KnowledgeBaseRepository,
  DocumentRepository,
  MembershipRepository,
  DocumentIndexExecutionQueue,
  DocumentIndexRepository,
  DocumentRevisionRepository,
  DocumentIndexFailureArchive,
  DocumentRelationRepository,
]

const createDocumentRetention = (
  membershipRepository: MembershipRepository,
  documentRevisionRepository: DocumentRevisionRepository,
  documentIndexRepository: DocumentIndexRepository,
  jobRepository: DocumentIndexExecutionQueue,
  failedJobRepository: DocumentIndexFailureArchive,
  documentRelationRepository: DocumentRelationRepository,
  documentRepository: DocumentRepository,
): InspectDocumentRetentionUseCase =>
  new InspectDocumentRetentionUseCase(
    new InspectMembershipRetentionUseCase(membershipRepository),
    new InspectDocumentRevisionRetentionUseCase(documentRevisionRepository),
    new InspectDocumentIndexRetentionUseCase(documentIndexRepository, jobRepository, failedJobRepository),
    new InspectDocumentRelationRetentionUseCase(documentRelationRepository),
    documentRepository,
  )

export const createGarbageCollectionListener = (
  ...[
    persistenceTransaction,
    documentRepository,
    membershipRepository,
    jobRepository,
    documentIndexRepository,
    documentRevisionRepository,
    failedJobRepository,
    chunkRepository,
    documentRelationRepository,
    config,
  ]: GarbageCollectionTestDependencies
): DocumentGarbageCollectionRequestedListener => {
  const membershipRetention = new InspectMembershipRetentionUseCase(membershipRepository)
  const indexRetention = new InspectDocumentIndexRetentionUseCase(
    documentIndexRepository,
    jobRepository,
    failedJobRepository,
  )

  return new DocumentGarbageCollectionRequestedListener(
    persistenceTransaction,
    documentRepository,
    new PlanDocumentIndexGarbageUseCase(documentIndexRepository, failedJobRepository),
    new CollectDocumentIndexGarbageUseCase(
      documentIndexRepository,
      jobRepository,
      failedJobRepository,
      membershipRetention,
      new CollectDocumentRelationGarbageUseCase(documentRelationRepository),
      new CollectIndexChunkGarbageUseCase(chunkRepository),
    ),
    new PlanDocumentRevisionGarbageUseCase(documentRevisionRepository),
    new CollectDocumentRevisionGarbageUseCase(documentRevisionRepository, indexRetention),
    new PlanDocumentRelationGarbageUseCase(documentRelationRepository),
    new LockDocumentRetentionParentsUseCase(documentRepository),
    createDocumentRetention(
      membershipRepository,
      documentRevisionRepository,
      documentIndexRepository,
      jobRepository,
      failedJobRepository,
      documentRelationRepository,
      documentRepository,
    ),
    config,
  )
}

export const createMembershipPruningUseCase = (
  ...[
    persistenceTransaction,
    knowledgeBaseRepository,
    documentRepository,
    membershipRepository,
    jobRepository,
    documentIndexRepository,
    documentRevisionRepository,
    failedJobRepository,
    documentRelationRepository,
  ]: MembershipPruningTestDependencies
): PruneKnowledgeBaseMembershipsUseCase => {
  const membershipRetention = new InspectMembershipRetentionUseCase(membershipRepository)

  return new PruneKnowledgeBaseMembershipsUseCase(
    persistenceTransaction,
    new ValidateKnowledgeBasePruningUseCase(knowledgeBaseRepository),
    new LockDocumentRetentionParentsUseCase(documentRepository),
    membershipRepository,
    new CancelMembershipIndexingListener(jobRepository),
    new StartDocumentIndexPruningRetentionUseCase(documentIndexRepository, jobRepository, membershipRetention),
    new StartDocumentPruningRetentionUseCase(
      documentRepository,
      createDocumentRetention(
        membershipRepository,
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
