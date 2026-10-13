import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityNotFoundError, type EntityManager, Repository } from 'typeorm'
import { LessThanOrEqual } from 'typeorm'

import type { HybridRetrieveDto } from '../../../Application/KnowledgeBases/DataTransferObjects/rag.dto.js'
import type { MarkdownPlan } from '../../../Domain/Knowledge/markdown-chunk.factory.js'
import { RagChunkModel } from '../Models/rag-chunk.model.js'
import { RagDocumentIndexModel } from '../Models/rag-document-index.model.js'
import { RagDocumentRelationModel } from '../Models/rag-document-relation.model.js'
import { RagDocumentRevisionModel } from '../Models/rag-document-revision.model.js'
import type { RetrievalChunk, RetrievalIndex } from './Contracts/rag-retrieval-store.js'
import { TypeOrmRagChunkRepository } from './typeorm-rag-chunk.repository.js'
import { TypeOrmRagDocumentRelationRepository } from './typeorm-rag-document-relation.repository.js'

const lexicalSegmenter = new Intl.Segmenter('zh-Hant', { granularity: 'word' })
const lexicalTerms = (text: string): string[] =>
  [...lexicalSegmenter.segment(text.toLocaleLowerCase('zh-Hant'))]
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment)

type BuildingRagDocumentIndexAttributes = {
  documentId: string
  revisionId: string
  pipelineHash: string
  chunkingModel: string
  chunkingProfile: string
  embeddingModel: string
  embeddingDimensions: number
  embeddingProfile: string
  lexicalProfile: string
  relationProfile: string
}

/** Index-primary reads, with revision data loaded in the same ORM query. */
@Injectable()
export class TypeOrmRagDocumentIndexRepository {
  constructor(
    @InjectRepository(RagDocumentIndexModel) private readonly indexes: Repository<RagDocumentIndexModel>,
    @InjectRepository(RagDocumentRevisionModel) private readonly revisions: Repository<RagDocumentRevisionModel>,
    private readonly chunkRepository: TypeOrmRagChunkRepository,
    private readonly relationRepository: TypeOrmRagDocumentRelationRepository,
  ) {}

  async findByRevisionAndPipeline(
    manager: EntityManager,
    revisionId: string,
    pipelineHash: string,
  ): Promise<RagDocumentIndexModel | null> {
    return manager.getRepository(RagDocumentIndexModel).findOneBy({ revisionId, pipelineHash })
  }

  async createBuildingIndex(
    manager: EntityManager,
    input: BuildingRagDocumentIndexAttributes,
  ): Promise<RagDocumentIndexModel> {
    const indexRepository = manager.getRepository(RagDocumentIndexModel)

    return indexRepository.save(
      indexRepository.create({ ...input, status: 'building', readyAt: null, unreferencedSince: null }),
    )
  }

  async lockById(manager: EntityManager, documentIndexId: string): Promise<RagDocumentIndexModel | null> {
    return manager.getRepository(RagDocumentIndexModel).findOne({
      where: { id: documentIndexId },
      lock: { mode: 'pessimistic_write' },
    })
  }

  async lockGarbageCandidate(
    manager: EntityManager,
    documentIndexId: string,
    retentionCutoff: Date,
  ): Promise<RagDocumentIndexModel | null> {
    return manager.getRepository(RagDocumentIndexModel).findOne({
      where: { id: documentIndexId, status: 'ready', unreferencedSince: LessThanOrEqual(retentionCutoff) },
      lock: { mode: 'pessimistic_write' },
    })
  }

  async remove(manager: EntityManager, documentIndex: RagDocumentIndexModel): Promise<void> {
    await manager.getRepository(RagDocumentIndexModel).remove(documentIndex)
  }

  async removePlan(manager: EntityManager, documentIndexId: string): Promise<void> {
    await this.relationRepository.removeForIndex(manager, documentIndexId)
    await this.chunkRepository.removeForIndex(manager, documentIndexId)
  }

  async findById(documentIndexId: string): Promise<RagDocumentIndexModel | null> {
    return this.indexes.findOneBy({ id: documentIndexId })
  }

  async findByIdIn(manager: EntityManager, documentIndexId: string): Promise<RagDocumentIndexModel | null> {
    return manager.getRepository(RagDocumentIndexModel).findOneBy({ id: documentIndexId })
  }

  /** Index-primary retrieval read. Related revision, chunks, and relations are loaded
   * through ORM joins within the caller's repeatable-read transaction. */
  async loadSnapshotData(
    manager: EntityManager,
    documentIndexIds: string[],
    input: HybridRetrieveDto,
  ): Promise<{
    indexes: RetrievalIndex[]
    revisions: Array<{ id: string; contentSha256: string; title: string | null }>
    chunks: RetrievalChunk[]
    relations: Array<{
      id: string
      sourceIndexId: string
      targetDocumentId: string | null
      targetReference: string
      targetAnchor: string | null
      relationType: string
      evidenceBlockStart: number
      evidenceBlockEnd: number
      evidenceText: string
    }>
    lexicalCandidateChunkIds: string[]
  }> {
    if (documentIndexIds.length === 0) {
      return { indexes: [], revisions: [], chunks: [], relations: [], lexicalCandidateChunkIds: [] }
    }

    const indexRepository = manager.getRepository(RagDocumentIndexModel)
    const indexRows = await indexRepository
      .createQueryBuilder('documentIndex')
      .innerJoin(RagDocumentRevisionModel, 'revision', 'revision.id = documentIndex.revisionId')
      .where('documentIndex.id IN (:...documentIndexIds)', { documentIndexIds })
      .getMany()
    const revisionRows = await manager
      .getRepository(RagDocumentRevisionModel)
      .createQueryBuilder('revision')
      .innerJoin(RagDocumentIndexModel, 'documentIndex', 'documentIndex.revisionId = revision.id')
      .where('documentIndex.id IN (:...documentIndexIds)', { documentIndexIds })
      .getMany()
    const chunkRows = await manager
      .getRepository(RagChunkModel)
      .createQueryBuilder('chunk')
      .innerJoin(RagDocumentIndexModel, 'documentIndex', 'documentIndex.id = chunk.documentIndexId')
      .where('documentIndex.id IN (:...documentIndexIds)', { documentIndexIds })
      .getMany()
    const relationRows = await manager
      .getRepository(RagDocumentRelationModel)
      .createQueryBuilder('relation')
      .innerJoin(RagDocumentIndexModel, 'documentIndex', 'documentIndex.id = relation.sourceIndexId')
      .where('documentIndex.id IN (:...documentIndexIds)', { documentIndexIds })
      .getMany()
    const queryTerms = lexicalTerms(input.queryText)
    const lexicalCandidates = queryTerms.length
      ? await manager
          .getRepository(RagChunkModel)
          .createQueryBuilder('chunk')
          .innerJoin(RagDocumentIndexModel, 'documentIndex', 'documentIndex.id = chunk.documentIndexId')
          .select('chunk.id', 'chunk_id')
          .addSelect("ts_rank(chunk.searchVector, plainto_tsquery('simple', :queryTerms))", 'lexical_score')
          .where('documentIndex.id IN (:...documentIndexIds)', { documentIndexIds })
          .andWhere("chunk.searchVector @@ plainto_tsquery('simple', :queryTerms)", {
            queryTerms: queryTerms.join(' '),
          })
          .orderBy('lexical_score', 'DESC')
          .take(input.topK ?? input.limit ?? 10)
          .getRawMany<{ chunk_id: string }>()
      : []

    return {
      indexes: indexRows.map((index) => ({
        id: index.id,
        documentId: index.documentId,
        revisionId: index.revisionId,
        chunkingProfile: index.chunkingProfile,
        embeddingModel: index.embeddingModel,
        embeddingDimensions: index.embeddingDimensions,
        lexicalProfile: index.lexicalProfile,
        readyAt: index.readyAt,
      })),
      revisions: revisionRows.map((revision) => ({
        id: revision.id,
        contentSha256: revision.contentSha256,
        title: revision.title,
      })),
      chunks: chunkRows.map((chunk) => ({
        id: chunk.id,
        documentIndexId: chunk.documentIndexId,
        ordinal: chunk.ordinal,
        headingPath: chunk.headingPath,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        embedding: chunk.embedding,
        searchVector: chunk.searchVector ? [chunk.searchVector] : [],
        blockStart: chunk.blockStart,
      })),
      relations: relationRows.map((relation) => ({
        id: relation.id,
        sourceIndexId: relation.sourceIndexId,
        targetDocumentId: relation.targetDocumentId,
        targetReference: relation.targetReference,
        targetAnchor: relation.targetAnchor,
        relationType: relation.relationType,
        evidenceBlockStart: relation.evidenceBlockStart,
        evidenceBlockEnd: relation.evidenceBlockEnd,
        evidenceText: relation.evidenceText,
      })),
      lexicalCandidateChunkIds: lexicalCandidates.map((candidate) => candidate.chunk_id),
    }
  }

  async loadContent(documentIndexId: string): Promise<string> {
    const indexWithRevision = await this.indexes
      .createQueryBuilder('documentIndex')
      .innerJoin(RagDocumentRevisionModel, 'revision', 'revision.id = documentIndex.revisionId')
      .select('revision.content', 'content')
      .where('documentIndex.id = :documentIndexId', { documentIndexId })
      .getRawOne<{ content: string }>()

    if (indexWithRevision) return indexWithRevision.content

    const documentIndex = await this.indexes.findOneByOrFail({ id: documentIndexId })
    throw new EntityNotFoundError(RagDocumentRevisionModel, { id: documentIndex.revisionId })
  }

  async replacePlan(
    manager: EntityManager,
    documentIndexId: string,
    plan: MarkdownPlan,
    vectors: number[][],
  ): Promise<void> {
    const documentIndex = await manager.getRepository(RagDocumentIndexModel).findOneOrFail({
      where: { id: documentIndexId },
      lock: { mode: 'pessimistic_write' },
    })

    if (documentIndex.status === 'ready') {
      return
    }

    await this.chunkRepository.replaceForIndex(manager, documentIndex.id, plan, vectors)
    await this.relationRepository.replaceForIndex(manager, documentIndex.id, plan)
  }

  async markReady(manager: EntityManager, documentIndexId: string): Promise<RagDocumentIndexModel> {
    const documentIndex = await manager.getRepository(RagDocumentIndexModel).findOneOrFail({
      where: { id: documentIndexId },
      lock: { mode: 'pessimistic_write' },
    })
    documentIndex.status = 'ready'
    documentIndex.readyAt = new Date()
    documentIndex.unreferencedSince = null

    return manager.getRepository(RagDocumentIndexModel).save(documentIndex)
  }

  async markUnreferenced(manager: EntityManager, documentIndexId: string): Promise<void> {
    const documentIndex = await manager.getRepository(RagDocumentIndexModel).findOneBy({ id: documentIndexId })

    if (!documentIndex) return

    documentIndex.unreferencedSince = new Date()
    await manager.getRepository(RagDocumentIndexModel).save(documentIndex)
  }

  async markUnreferencedOutsideTransaction(documentIndexId: string): Promise<void> {
    await this.indexes.update({ id: documentIndexId }, { unreferencedSince: new Date() })
  }

  async removeUnreferenced(manager: EntityManager, documentIndexId: string): Promise<void> {
    await manager.getRepository(RagDocumentIndexModel).delete({ id: documentIndexId })
  }

  async findGarbageCollectionCandidates(retentionCutoff: Date): Promise<RagDocumentIndexModel[]> {
    return this.indexes.find({
      where: { status: 'ready', unreferencedSince: LessThanOrEqual(retentionCutoff) },
    })
  }
}
