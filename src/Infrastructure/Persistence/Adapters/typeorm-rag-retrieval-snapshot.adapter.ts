import type { EntityManager } from 'typeorm'

import { RagChunkQueryAdapter } from './rag-chunk-query.adapter.js'
import type {
  RagChunkCandidateFacts,
  RagChunkLexicalQuery,
  RagChunkRepositoryPort,
  RagChunkSemanticQuery,
} from '../../../Application/KnowledgeBases/Contracts/rag-chunk-repository.port.js'
import type {
  RagRetrievalContextCriteria,
  RetrievalChunk,
  RetrievalSnapshot,
} from '../../../Application/KnowledgeBases/Contracts/rag-retrieval-store.js'
import type { RagRelationType } from '../../../Domain/Knowledge/Enums/rag-relation-type.enum.js'
import type { RagSourceTypeEnum } from '../../../Domain/Knowledge/Enums/rag-source-type.enum.js'
import type { TypeOrmRagChunkRepository } from '../Repositories/typeorm-rag-chunk.repository.js'
import type { TypeOrmRagDocumentIndexRepository } from '../Repositories/typeorm-rag-document-index.repository.js'
import type { TypeOrmRagDocumentRelationRepository } from '../Repositories/typeorm-rag-document-relation.repository.js'
import type { TypeOrmRagDocumentRevisionRepository } from '../Repositories/typeorm-rag-document-revision.repository.js'
import type { TypeOrmRagDocumentRepository } from '../Repositories/typeorm-rag-document.repository.js'
import type { TypeOrmRagKnowledgeBaseRepository } from '../Repositories/typeorm-rag-knowledge-base.repository.js'
import type { TypeOrmRagMembershipRepository } from '../Repositories/typeorm-rag-membership.repository.js'

/** Binds model queries to one database snapshot. Eligibility and ranking are supplied by the use case. */
export class TypeOrmRagRetrievalSnapshotAdapter implements RagChunkRepositoryPort {
  constructor(
    private readonly manager: EntityManager,
    private readonly knowledgeBases: TypeOrmRagKnowledgeBaseRepository,
    private readonly memberships: TypeOrmRagMembershipRepository,
    private readonly documents: TypeOrmRagDocumentRepository,
    private readonly indexes: TypeOrmRagDocumentIndexRepository,
    private readonly revisions: TypeOrmRagDocumentRevisionRepository,
    private readonly chunks: TypeOrmRagChunkRepository,
    private readonly relations: TypeOrmRagDocumentRelationRepository,
  ) {}

  async loadFacts(projectId: string): Promise<RetrievalSnapshot> {
    const knowledgeBase = await this.knowledgeBases.findByProjectIdIn(this.manager, projectId)
    const memberships = knowledgeBase ? await this.memberships.findForKnowledgeBase(this.manager, knowledgeBase.id) : []
    const documentIds = memberships.map((membership) => membership.documentId)
    const documents = await this.documents.findByIdsIn(this.manager, documentIds)
    const indexes = await this.indexes.findForDocumentIdsIn(this.manager, documentIds)
    const indexIds = indexes.map((index) => index.id)
    const revisions = await this.revisions.findByIdsIn(
      this.manager,
      indexes.map((index) => index.revisionId),
    )
    const relations = await this.relations.findForSourceIndexIdsIn(this.manager, indexIds)
    const chunkCountsByIndexId = await this.chunks.countByIndexIdsIn(this.manager, indexIds)

    return {
      knowledgeBaseId: knowledgeBase?.id ?? null,
      memberships: memberships.map((membership) => ({
        documentId: membership.documentId,
        activeDocumentIndexId: membership.activeDocumentIndexId,
        isEntry: membership.isEntry,
        alwaysIncludeFullContent: membership.alwaysIncludeFullContent,
      })),
      documents: documents.map((document) => ({
        id: document.id,
        sourcePath: document.sourcePath,
        sourceKey: document.sourceKey,
        sourceType: document.sourceType as RagSourceTypeEnum,
      })),
      indexes: indexes.map((index) => ({
        id: index.id,
        documentId: index.documentId,
        revisionId: index.revisionId,
        chunkingModel: index.chunkingModel,
        chunkingProfile: index.chunkingProfile,
        embeddingModel: index.embeddingModel,
        embeddingDimensions: index.embeddingDimensions,
        embeddingProfile: index.embeddingProfile,
        lexicalProfile: index.lexicalProfile,
        relationProfile: index.relationProfile,
        readyAt: index.readyAt,
      })),
      revisions: revisions.map((revision) => ({
        id: revision.id,
        contentSha256: revision.contentSha256,
        title: revision.title,
        fullContent: revision.content,
      })),
      relations: relations.map((relation) => ({
        id: relation.id,
        sourceIndexId: relation.sourceIndexId,
        targetDocumentId: relation.targetDocumentId,
        targetReference: relation.targetReference,
        targetAnchor: relation.targetAnchor,
        relationType: relation.relationType as RagRelationType,
        evidenceBlockStart: relation.evidenceBlockStart,
        evidenceBlockEnd: relation.evidenceBlockEnd,
        evidenceText: relation.evidenceText,
      })),
      chunkCountsByIndexId,
      chunks: [],
      lexicalCandidateChunkIds: [],
    }
  }

  async findChunks(indexIds: string[]): Promise<RetrievalChunk[]> {
    const chunks = await this.chunks.findRetrievalChunksIn(this.manager, indexIds)

    return chunks.map((chunk) => RagChunkQueryAdapter.toDTO(chunk))
  }

  async findSemanticCandidates(query: RagChunkSemanticQuery): Promise<RagChunkCandidateFacts> {
    const rows = await this.chunks.findSemanticCandidateRowsIn(this.manager, query)

    return RagChunkQueryAdapter.toCandidateDTO(rows)
  }

  async findLexicalCandidates(query: RagChunkLexicalQuery): Promise<RagChunkCandidateFacts> {
    const rows = await this.chunks.findLexicalCandidateRowsIn(this.manager, query)

    return RagChunkQueryAdapter.toCandidateDTO(rows)
  }

  async findContext(criteria: RagRetrievalContextCriteria, indexIds: string[]): Promise<RetrievalChunk[]> {
    const chunks = await this.chunks.findRetrievalContextIn(this.manager, criteria, indexIds)

    return chunks.map((chunk) => RagChunkQueryAdapter.toDTO(chunk))
  }
}
