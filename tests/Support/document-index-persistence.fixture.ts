import { FindLexicalChunkCandidatesQueryHandler } from '../../src/Chunks/Application/Queries/find-lexical-chunk-candidates.query.handler.ts'
import { FindRetrievalChunkCandidatesQueryHandler } from '../../src/Chunks/Application/Queries/find-retrieval-chunk-candidates.query.handler.ts'
import { LoadRetrievalChunkContextQueryHandler } from '../../src/Chunks/Application/Queries/load-retrieval-chunk-context.query.handler.ts'
import { LoadRetrievalIndexChunksQueryHandler } from '../../src/Chunks/Application/Queries/load-retrieval-index-chunks.query.handler.ts'
import { ChunkRepository } from '../../src/Chunks/Infrastructure/Persistence/TypeORM/Repositories/chunk.repository.ts'
import { ReadDocumentIndexingStatusListener } from '../../src/DocumentIndexes/Application/Listeners/read-document-indexing-status.listener.ts'
import { LoadRetrievalDocumentIndexesQueryHandler } from '../../src/DocumentIndexes/Application/Queries/load-retrieval-document-indexes.query.handler.ts'
import { DocumentIndexSuccessReceiptRepository } from '../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/document-index-success-receipt.repository.ts'
import { DocumentIndexRepository } from '../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/document-index.repository.ts'
import { FailedJobRepository } from '../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/failed-job.repository.ts'
import { JobRepository } from '../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/job.repository.ts'
import { LoadRetrievalDocumentRelationsQueryHandler } from '../../src/DocumentRelations/Application/Queries/load-retrieval-document-relations.query.handler.ts'
import { DocumentRelationRepository } from '../../src/DocumentRelations/Infrastructure/Persistence/TypeORM/Repositories/document-relation.repository.ts'
import { LoadRetrievalDocumentRevisionsQueryHandler } from '../../src/DocumentRevisions/Application/Queries/load-retrieval-document-revisions.query.handler.ts'
import { DocumentRevisionRepository } from '../../src/DocumentRevisions/Infrastructure/Persistence/TypeORM/Repositories/document-revision.repository.ts'
import { LoadRetrievalDocumentsQueryHandler } from '../../src/Documents/Application/Queries/load-retrieval-documents.query.handler.ts'
import { DocumentRepository } from '../../src/Documents/Infrastructure/Persistence/TypeORM/Repositories/document.repository.ts'
import { GetKnowledgeBaseDocumentIndexingStateQueryHandler } from '../../src/KnowledgeBaseDocuments/Application/Queries/get-knowledge-base-document-indexing-state.query.handler.ts'
import { LoadRetrievalKnowledgeBaseDocumentsQueryHandler } from '../../src/KnowledgeBaseDocuments/Application/Queries/load-retrieval-knowledge-base-documents.query.handler.ts'
import { KnowledgeBaseDocumentRepository } from '../../src/KnowledgeBaseDocuments/Infrastructure/Persistence/TypeORM/Repositories/knowledge-base-document.repository.ts'
import { RetrievalSnapshotKnowledgeBaseAssembler } from '../../src/KnowledgeBases/Application/Assemblers/retrieval-snapshot-knowledge-base.assembler.ts'
import type { RetrievalProfileSettingsDTO } from '../../src/KnowledgeBases/Application/DataTransferObjects/retrieval-profile-settings.dto.ts'
import { RetrieveKnowledgeBaseContentQueryHandler } from '../../src/KnowledgeBases/Application/Queries/retrieve-knowledge-base-content.query.handler.ts'
import type { RetrievalSnapshot } from '../../src/KnowledgeBases/Application/Types/retrieval-snapshot.ts'
import { KnowledgeBaseRepository } from '../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Repositories/knowledge-base.repository.ts'
import type { EmbeddingProvider } from '../../src/Shared/Application/Ports/Out/Gateways/embedding-provider.ts'
import { PersistenceTransaction } from '../../src/Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'

type RetrievalSnapshotParams = {
  projectId: string
  includeNonEffective: boolean
  lexicalTerms: readonly string[]
}

type RetrievalSnapshotLimitsParams = {
  snapshotLexicalLimit: number
  vectorCandidateLimit: number
  lexicalCandidateLimit: number
}

/** All write repositories in a fixture share the same async transaction resource. */
export class DocumentIndexPersistenceFixture {
  private readonly jobStatusUseCase: ReadDocumentIndexingStatusListener

  constructor(
    readonly persistenceTransaction: PersistenceTransaction,
    readonly jobRepository: JobRepository,
    readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository,
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
      new GetKnowledgeBaseDocumentIndexingStateQueryHandler(knowledgeBaseDocumentRepository),
      documentIndexRepository,
      failedJobRepository,
      new DocumentIndexSuccessReceiptRepository(persistenceTransaction),
    )
  }

  createRetrievalUseCase(
    embeddingProvider: EmbeddingProvider,
    profiles: RetrievalProfileSettingsDTO,
  ): RetrieveKnowledgeBaseContentQueryHandler {
    return new RetrieveKnowledgeBaseContentQueryHandler(
      this.persistenceTransaction,
      this.knowledgeBaseRepository,
      new LoadRetrievalKnowledgeBaseDocumentsQueryHandler(this.knowledgeBaseDocumentRepository),
      new LoadRetrievalDocumentsQueryHandler(this.documentRepository),
      new LoadRetrievalDocumentIndexesQueryHandler(this.documentIndexRepository),
      new LoadRetrievalDocumentRevisionsQueryHandler(this.documentRevisionRepository),
      new LoadRetrievalIndexChunksQueryHandler(this.chunkRepository),
      new LoadRetrievalDocumentRelationsQueryHandler(this.documentRelationRepository),
      new FindRetrievalChunkCandidatesQueryHandler(
        this.chunkRepository,
        new FindLexicalChunkCandidatesQueryHandler(this.chunkRepository),
      ),
      new LoadRetrievalChunkContextQueryHandler(this.chunkRepository),
      embeddingProvider,
      profiles,
    )
  }

  /** Fixture inspection only; production retrieval reads are owned by the actual use case. */
  async loadSnapshot(
    retrievalSnapshotParams: RetrievalSnapshotParams,
    retrievalSnapshotLimitsParams: RetrievalSnapshotLimitsParams,
  ): Promise<RetrievalSnapshot> {
    void retrievalSnapshotLimitsParams

    return this.persistenceTransaction.runReadOnlySnapshot(async () => {
      const knowledgeBase = await this.knowledgeBaseRepository.findByProjectId({
        projectId: retrievalSnapshotParams.projectId,
      })
      const knowledgeBaseDocuments = knowledgeBase
        ? await new LoadRetrievalKnowledgeBaseDocumentsQueryHandler(this.knowledgeBaseDocumentRepository).execute({
            knowledgeBaseId: knowledgeBase.id,
          })
        : []
      const documentIds = knowledgeBaseDocuments.map((member) => member.documentId)
      const documents = await new LoadRetrievalDocumentsQueryHandler(this.documentRepository).execute({ documentIds })
      const indexes = await new LoadRetrievalDocumentIndexesQueryHandler(this.documentIndexRepository).execute({
        documentIds,
      })
      const revisions = await new LoadRetrievalDocumentRevisionsQueryHandler(this.documentRevisionRepository).execute({
        revisionIds: indexes.map((index) => index.revisionId),
      })
      const relations = await new LoadRetrievalDocumentRelationsQueryHandler(this.documentRelationRepository).execute({
        documentIndexIds: indexes.map((index) => index.id),
      })
      const chunks = await new LoadRetrievalIndexChunksQueryHandler(this.chunkRepository).execute({
        fullContentIndexIds: indexes.map((index) => index.id),
        countedIndexIds: [],
      })
      const snapshot = RetrievalSnapshotKnowledgeBaseAssembler.toRetrievalSnapshot({
        knowledgeBaseId: knowledgeBase?.id ?? null,
        knowledgeBase,
        knowledgeBaseDocuments,
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
