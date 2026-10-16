import { FindLexicalChunkCandidatesUseCase } from '../../src/Application/Chunks/UseCases/find-lexical-chunk-candidates.use-case.ts'
import { FindRetrievalChunkCandidatesUseCase } from '../../src/Application/Chunks/UseCases/find-retrieval-chunk-candidates.use-case.ts'
import { LoadRetrievalChunkContextUseCase } from '../../src/Application/Chunks/UseCases/load-retrieval-chunk-context.use-case.ts'
import { LoadRetrievalIndexChunksUseCase } from '../../src/Application/Chunks/UseCases/load-retrieval-index-chunks.use-case.ts'
import { ReadDocumentIndexingStatusListener } from '../../src/Application/DocumentIndexes/Listeners/read-document-indexing-status.listener.ts'
import { LoadRetrievalDocumentIndexesUseCase } from '../../src/Application/DocumentIndexes/UseCases/load-retrieval-document-indexes.use-case.ts'
import { LoadRetrievalDocumentRelationsUseCase } from '../../src/Application/DocumentRelations/UseCases/load-retrieval-document-relations.use-case.ts'
import { LoadRetrievalDocumentRevisionsUseCase } from '../../src/Application/DocumentRevisions/UseCases/load-retrieval-document-revisions.use-case.ts'
import { LoadRetrievalDocumentsUseCase } from '../../src/Application/Documents/UseCases/load-retrieval-documents.use-case.ts'
import { RetrievalSnapshotKnowledgeBaseAssembler } from '../../src/Application/KnowledgeBases/Assemblers/retrieval-snapshot-knowledge-base.assembler.ts'
import type { EmbeddingProvider } from '../../src/Application/KnowledgeBases/Contracts/embedding-provider.ts'
import type { RetrievalProfileSettingsDto } from '../../src/Application/KnowledgeBases/DataTransferObjects/retrieval-profile-settings.dto.ts'
import type {
  RetrievalSnapshotQueryObject,
  RetrievalSnapshotLimitsQueryObject,
} from '../../src/Application/KnowledgeBases/QueryObjects/retrieval-snapshot.query-object.ts'
import type { RetrievalSnapshot } from '../../src/Application/KnowledgeBases/Types/retrieval-snapshot.ts'
import { RetrieveKnowledgeBaseContentUseCase } from '../../src/Application/KnowledgeBases/UseCases/retrieve-knowledge-base-content.use-case.ts'
import { GetMembershipIndexingStateUseCase } from '../../src/Application/Memberships/UseCases/get-membership-indexing-state.use-case.ts'
import { LoadRetrievalMembershipsUseCase } from '../../src/Application/Memberships/UseCases/load-retrieval-memberships.use-case.ts'
import { PersistenceTransaction } from '../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { ChunkRepository } from '../../src/Infrastructure/Persistence/Repositories/chunk.repository.ts'
import { DocumentIndexRepository } from '../../src/Infrastructure/Persistence/Repositories/document-index.repository.ts'
import { DocumentRelationRepository } from '../../src/Infrastructure/Persistence/Repositories/document-relation.repository.ts'
import { DocumentRevisionRepository } from '../../src/Infrastructure/Persistence/Repositories/document-revision.repository.ts'
import { DocumentRepository } from '../../src/Infrastructure/Persistence/Repositories/document.repository.ts'
import { FailedJobRepository } from '../../src/Infrastructure/Persistence/Repositories/failed-job.repository.ts'
import { JobRepository } from '../../src/Infrastructure/Persistence/Repositories/job.repository.ts'
import { KnowledgeBaseDocumentMembershipRepository } from '../../src/Infrastructure/Persistence/Repositories/knowledge-base-document-membership.repository.ts'
import { KnowledgeBaseRepository } from '../../src/Infrastructure/Persistence/Repositories/knowledge-base.repository.ts'

/** All write repositories in a fixture share the same async transaction resource. */
export class DocumentIndexPersistenceFixture {
  private readonly jobStatusUseCase: ReadDocumentIndexingStatusListener

  constructor(
    readonly persistenceTransaction: PersistenceTransaction,
    readonly jobRepository: JobRepository,
    readonly membershipRepository: KnowledgeBaseDocumentMembershipRepository,
    readonly documentIndexRepository: DocumentIndexRepository,
    readonly knowledgeBaseRepository: KnowledgeBaseRepository,
    readonly documentRepository: DocumentRepository,
    readonly documentRevisionRepository: DocumentRevisionRepository,
    readonly failedJobRepository: FailedJobRepository,
    readonly chunkRepository: ChunkRepository,
    readonly documentRelationRepository: DocumentRelationRepository,
  ) {
    this.jobStatusUseCase = new ReadDocumentIndexingStatusListener(
      jobRepository,
      new GetMembershipIndexingStateUseCase(membershipRepository),
      documentIndexRepository,
      failedJobRepository,
    )
  }

  createRetrievalUseCase(
    embeddingProvider: EmbeddingProvider,
    profiles: RetrievalProfileSettingsDto,
  ): RetrieveKnowledgeBaseContentUseCase {
    return new RetrieveKnowledgeBaseContentUseCase(
      this.persistenceTransaction,
      this.knowledgeBaseRepository,
      new LoadRetrievalMembershipsUseCase(this.membershipRepository),
      new LoadRetrievalDocumentsUseCase(this.documentRepository),
      new LoadRetrievalDocumentIndexesUseCase(this.documentIndexRepository),
      new LoadRetrievalDocumentRevisionsUseCase(this.documentRevisionRepository),
      new LoadRetrievalIndexChunksUseCase(this.chunkRepository),
      new LoadRetrievalDocumentRelationsUseCase(this.documentRelationRepository),
      new FindRetrievalChunkCandidatesUseCase(
        this.chunkRepository,
        new FindLexicalChunkCandidatesUseCase(this.chunkRepository),
      ),
      new LoadRetrievalChunkContextUseCase(this.chunkRepository),
      embeddingProvider,
      profiles,
    )
  }

  /** Fixture inspection only; production retrieval reads are owned by the actual use case. */
  async loadSnapshot(
    retrievalSnapshotQO: RetrievalSnapshotQueryObject,
    retrievalSnapshotLimitsQO: RetrievalSnapshotLimitsQueryObject,
  ): Promise<RetrievalSnapshot> {
    void retrievalSnapshotLimitsQO

    return this.persistenceTransaction.runReadOnlySnapshot(async () => {
      const knowledgeBase = await this.knowledgeBaseRepository.findByProjectId({
        projectId: retrievalSnapshotQO.projectId,
      })
      const memberships = knowledgeBase
        ? await new LoadRetrievalMembershipsUseCase(this.membershipRepository).execute({
            knowledgeBaseId: knowledgeBase.id,
          })
        : []
      const documentIds = memberships.map((member) => member.documentId)
      const documents = await new LoadRetrievalDocumentsUseCase(this.documentRepository).execute({ documentIds })
      const indexes = await new LoadRetrievalDocumentIndexesUseCase(this.documentIndexRepository).execute({
        documentIds,
      })
      const revisions = await new LoadRetrievalDocumentRevisionsUseCase(this.documentRevisionRepository).execute({
        revisionIds: indexes.map((index) => index.revisionId),
      })
      const relations = await new LoadRetrievalDocumentRelationsUseCase(this.documentRelationRepository).execute({
        documentIndexIds: indexes.map((index) => index.id),
      })
      const chunks = await new LoadRetrievalIndexChunksUseCase(this.chunkRepository).execute({
        fullContentIndexIds: indexes.map((index) => index.id),
        countedIndexIds: [],
      })
      const snapshot = RetrievalSnapshotKnowledgeBaseAssembler.toRetrievalSnapshot({
        knowledgeBaseId: knowledgeBase?.id ?? null,
        knowledgeBase,
        memberships,
        documents,
        indexes,
        revisions,
        relations,
      })

      return RetrievalSnapshotKnowledgeBaseAssembler.withRetrievalChunks(snapshot, chunks)
    })
  }

  get jobStatus(): ReadDocumentIndexingStatusListener['handle'] {
    return this.jobStatusUseCase.handle.bind(this.jobStatusUseCase)
  }
}
