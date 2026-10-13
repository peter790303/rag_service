import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, EntityManager, In, Repository } from 'typeorm'

import type {
  HybridCandidate,
  HybridSnapshotResult,
  RagRelationType,
  RetrievalChunk,
  RetrievalSnapshot,
} from './Contracts/rag-retrieval-store.js'
import { normalizeDocumentPath } from '../../../Application/KnowledgeBases/Assemblers/retrieval-result.assembler.js'
import { EmbeddingProvider } from '../../../Application/KnowledgeBases/Contracts/embedding-provider.js'
import type { HybridRetrieveDto } from '../../../Application/KnowledgeBases/DataTransferObjects/rag.dto.js'
import { RagSourceTypeEnum } from '../../../Domain/Knowledge/Enums/rag-source-type.enum.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'
import { LEXICAL_PROFILE_VERSION } from '../../../Domain/Knowledge/ValueObjects/lexical-profile.js'
import { RagChunkModel } from '../Models/rag-chunk.model.js'
import { RagDocumentIndexModel } from '../Models/rag-document-index.model.js'
import { RagDocumentRelationModel } from '../Models/rag-document-relation.model.js'
import { RagDocumentRevisionModel } from '../Models/rag-document-revision.model.js'
import { RagMembershipModel } from '../Models/rag-membership.model.js'

@Injectable()
export class TypeOrmRagMembershipRepository {
  constructor(
    @InjectRepository(RagMembershipModel) private readonly memberships: Repository<RagMembershipModel>,
    @Inject(EmbeddingProvider) private readonly embeddings: EmbeddingProvider,
  ) {}

  async findForSource(knowledgeBaseId: string, documentId: string): Promise<RagMembershipModel | null> {
    return this.memberships.findOneBy({ knowledgeBaseId, documentId })
  }

  async lockMembership(
    manager: EntityManager,
    knowledgeBaseId: string,
    documentId: string,
  ): Promise<RagMembershipModel | null> {
    return manager.getRepository(RagMembershipModel).findOne({
      where: { knowledgeBaseId, documentId },
      lock: { mode: 'pessimistic_write' },
    })
  }

  async createForSource(knowledgeBaseId: string, documentId: string): Promise<RagMembershipModel> {
    return this.memberships.save(
      this.memberships.create({
        knowledgeBaseId,
        documentId,
        requestedGeneration: '0',
        activeDocumentIndexId: null,
        isEntry: false,
        alwaysIncludeFullContent: false,
      }),
    )
  }

  async saveRequest(membership: RagMembershipModel): Promise<RagMembershipModel> {
    return this.memberships.save(membership)
  }

  async saveRequestIn(manager: EntityManager, membership: RagMembershipModel): Promise<RagMembershipModel> {
    return manager.getRepository(RagMembershipModel).save(membership)
  }

  async findActiveReference(documentIndexId: string): Promise<RagMembershipModel | null> {
    return this.memberships.findOneBy({ activeDocumentIndexId: documentIndexId })
  }

  async findActiveReferenceIn(manager: EntityManager, documentIndexId: string): Promise<RagMembershipModel | null> {
    return manager.getRepository(RagMembershipModel).findOneBy({ activeDocumentIndexId: documentIndexId })
  }

  async lockForKnowledgeBase(manager: EntityManager, knowledgeBaseId: string): Promise<RagMembershipModel[]> {
    return manager
      .getRepository(RagMembershipModel)
      .createQueryBuilder('membership')
      .where('membership.knowledgeBaseId = :knowledgeBaseId', { knowledgeBaseId })
      .setLock('pessimistic_write')
      .getMany()
  }

  async remove(manager: EntityManager, membership: RagMembershipModel): Promise<void> {
    await manager.getRepository(RagMembershipModel).remove(membership)
  }

  async activateIndex(
    manager: EntityManager,
    knowledgeBaseId: string,
    documentId: string,
    documentIndexId: string,
    generation: string,
  ): Promise<{ activated: boolean; previousDocumentIndexId: string | null }> {
    const membershipRepository = manager.getRepository(RagMembershipModel)
    const membership = await membershipRepository.findOne({
      where: { knowledgeBaseId, documentId },
      lock: { mode: 'pessimistic_write' },
    })

    if (!membership || membership.requestedGeneration !== generation) {
      return { activated: false, previousDocumentIndexId: null }
    }

    const previousDocumentIndexId = membership.activeDocumentIndexId
    membership.activeDocumentIndexId = documentIndexId

    await membershipRepository.save(membership)

    return { activated: true, previousDocumentIndexId }
  }

  async loadSnapshot(input: HybridRetrieveDto): Promise<RetrievalSnapshot> {
    return this.memberships.manager.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY')

      return this.loadSnapshotIn(manager, input)
    })
  }

  async loadHybridSnapshot(
    input: HybridRetrieveDto,
    queryVector: number[],
    limits: { vectorLimit: number; lexicalLimit: number },
  ): Promise<HybridSnapshotResult> {
    return this.memberships.manager.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY')
      const snapshot = await this.loadSnapshotIn(manager, input)
      const requestedPath = input.documentReference ? normalizeDocumentPath(input.documentReference) : null
      const documentById = new Map(snapshot.documents.map((document) => [document.id, document]))
      const activeIndexIds = snapshot.memberships.flatMap((membership) => {
        if (
          requestedPath !== null &&
          normalizeDocumentPath(documentById.get(membership.documentId)?.sourcePath ?? '') !== requestedPath
        )
          return []

        return membership.activeDocumentIndexId ? [membership.activeDocumentIndexId] : []
      })

      if (activeIndexIds.length) {
        const activeIndexes = snapshot.indexes.filter((index) => activeIndexIds.includes(index.id))
        const queryEmbeddingModelId = input.queryVector ? input.embeddingModelId : this.embeddings.modelId

        if (
          activeIndexes.length !== new Set(activeIndexIds).size ||
          queryVector.length === 0 ||
          activeIndexes.some(
            (index) =>
              index.embeddingDimensions !== queryVector.length ||
              index.embeddingModel !== queryEmbeddingModelId ||
              index.lexicalProfile !== LEXICAL_PROFILE_VERSION,
          )
        )
          throw new KnowledgeEmbeddingUnavailableException()
      }

      const candidates = await this.findHybridCandidatesIn(manager, input, queryVector, activeIndexIds, limits)
      const contextChunks = await this.loadCandidateContextIn(manager, input, candidates, activeIndexIds)
      const relationTargetChunks = await this.loadRelationTargetChunksIn(manager, input.projectId, activeIndexIds)

      return { snapshot, candidates, contextChunks, relationTargetChunks }
    })
  }

  private async loadRelationTargetChunksIn(
    manager: EntityManager,
    projectId: string,
    activeIndexIds: string[],
  ): Promise<RetrievalChunk[]> {
    if (!activeIndexIds.length) return []

    const chunkRecords = await manager
      .getRepository(RagChunkModel)
      .createQueryBuilder('chunk')
      .innerJoin(RagDocumentIndexModel, 'documentIndex', 'documentIndex.id = chunk.documentIndexId')
      .innerJoin(RagMembershipModel, 'membership', 'membership.activeDocumentIndexId = documentIndex.id')
      .innerJoin('membership.knowledgeBase', 'knowledgeBase')
      .where('knowledgeBase.projectId = :projectId', { projectId })
      .andWhere('membership.activeDocumentIndexId IN (:...activeIndexIds)', { activeIndexIds })
      .select('chunk.id', 'chunk_id')
      .addSelect('chunk.documentIndexId', 'chunk_documentIndexId')
      .addSelect('chunk.ordinal', 'chunk_ordinal')
      .addSelect('chunk.headingPath', 'chunk_headingPath')
      .addSelect('chunk.content', 'chunk_content')
      .addSelect('chunk.tokenCount', 'chunk_tokenCount')
      .addSelect('chunk.embedding', 'chunk_embedding')
      .addSelect('chunk.searchVector', 'chunk_searchVector')
      .addSelect('chunk.blockStart', 'chunk_blockStart')
      .getRawMany<Record<string, unknown>>()

    return chunkRecords.map((chunkRecord) => ({
      id: String(chunkRecord.chunk_id),
      documentIndexId: String(chunkRecord.chunk_documentIndexId),
      ordinal: Number(chunkRecord.chunk_ordinal),
      headingPath: Array.isArray(chunkRecord.chunk_headingPath) ? (chunkRecord.chunk_headingPath as string[]) : [],
      content: String(chunkRecord.chunk_content),
      tokenCount: chunkRecord.chunk_tokenCount === null ? null : Number(chunkRecord.chunk_tokenCount),
      embedding: Array.isArray(chunkRecord.chunk_embedding) ? (chunkRecord.chunk_embedding as number[]) : [],
      searchVector: chunkRecord.chunk_searchVector ? [String(chunkRecord.chunk_searchVector)] : [],
      blockStart: Number(chunkRecord.chunk_blockStart),
    }))
  }

  async findHybridCandidates(
    input: HybridRetrieveDto,
    queryVector: number[],
    activeIndexIds: string[],
    limits: { vectorLimit: number; lexicalLimit: number },
  ): Promise<HybridCandidate[]> {
    if (!activeIndexIds.length) return []

    return this.memberships.manager.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY')

      return this.findHybridCandidatesIn(manager, input, queryVector, activeIndexIds, limits)
    })
  }

  async loadCandidateContext(
    input: HybridRetrieveDto,
    selectedChunkIds: string[],
    activeIndexIds: string[],
  ): Promise<RetrievalChunk[]> {
    if (!selectedChunkIds.length || !activeIndexIds.length) return []

    return this.memberships.manager.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY')
      const selectedChunkRecords = await manager
        .getRepository(RagChunkModel)
        .createQueryBuilder('selectedChunk')
        .innerJoin(RagDocumentIndexModel, 'documentIndex', 'documentIndex.id = selectedChunk.documentIndexId')
        .innerJoin(RagMembershipModel, 'membership', 'membership.activeDocumentIndexId = documentIndex.id')
        .innerJoin('membership.knowledgeBase', 'knowledgeBase')
        .where('knowledgeBase.projectId = :projectId', { projectId: input.projectId })
        .andWhere('selectedChunk.id IN (:...selectedChunkIds)', { selectedChunkIds })
        .andWhere('membership.activeDocumentIndexId IN (:...activeIndexIds)', { activeIndexIds })
        .select('selectedChunk.id', 'selectedChunk_id')
        .addSelect('selectedChunk.documentIndexId', 'selectedChunk_documentIndexId')
        .addSelect('selectedChunk.ordinal', 'selectedChunk_ordinal')
        .getRawMany<{
          selectedChunk_id: string
          selectedChunk_documentIndexId: string
          selectedChunk_ordinal: number
        }>()
      const indexToOrdinals = selectedChunkRecords.reduce((collected, selectedChunkRecord) => {
        const ordinals = collected.get(selectedChunkRecord.selectedChunk_documentIndexId) ?? []
        ordinals.push(Number(selectedChunkRecord.selectedChunk_ordinal))
        collected.set(selectedChunkRecord.selectedChunk_documentIndexId, ordinals)

        return collected
      }, new Map<string, number[]>())

      if (!indexToOrdinals.size) return []

      return this.loadCandidateContextIn(
        manager,
        input,
        selectedChunkRecords.map((selectedChunkRecord) => ({
          chunk: {
            id: selectedChunkRecord.selectedChunk_id,
            documentIndexId: selectedChunkRecord.selectedChunk_documentIndexId,
            ordinal: Number(selectedChunkRecord.selectedChunk_ordinal),
          },
        })),
        activeIndexIds,
      )
    })
  }

  private async loadCandidateContextIn(
    manager: EntityManager,
    input: HybridRetrieveDto,
    candidates: Array<{ chunk: Pick<RetrievalChunk, 'id' | 'documentIndexId' | 'ordinal'> }>,
    activeIndexIds: string[],
  ): Promise<RetrievalChunk[]> {
    if (!candidates.length || !activeIndexIds.length) return []

    const indexToNeighborOrdinals = candidates.reduce((collected, candidate) => {
      const neighborOrdinals = collected.get(candidate.chunk.documentIndexId) ?? []
      neighborOrdinals.push(candidate.chunk.ordinal - 1, candidate.chunk.ordinal + 1)
      collected.set(candidate.chunk.documentIndexId, neighborOrdinals)

      return collected
    }, new Map<string, number[]>())
    const validIndexOrdinals = [...indexToNeighborOrdinals.entries()]
      .map(([documentIndexId, neighborOrdinals]) => ({
        documentIndexId,
        neighborOrdinals: [...new Set(neighborOrdinals.filter((ordinal) => ordinal >= 0))],
      }))
      .filter((indexOrdinals) => indexOrdinals.neighborOrdinals.length > 0)

    if (!validIndexOrdinals.length) return []

    const contextRecords = await manager
      .getRepository(RagChunkModel)
      .createQueryBuilder('contextChunk')
      .innerJoin(RagDocumentIndexModel, 'documentIndex', 'documentIndex.id = contextChunk.documentIndexId')
      .innerJoin(RagMembershipModel, 'membership', 'membership.activeDocumentIndexId = documentIndex.id')
      .innerJoin('membership.knowledgeBase', 'knowledgeBase')
      .where('knowledgeBase.projectId = :projectId', { projectId: input.projectId })
      .andWhere('membership.activeDocumentIndexId IN (:...activeIndexIds)', { activeIndexIds })
      .andWhere(
        new Brackets((neighborConditions) =>
          validIndexOrdinals
            .map((indexOrdinals, index) => ({
              condition: `(contextChunk.documentIndexId = :contextIndexId${index} AND contextChunk.ordinal IN (:...contextOrdinals${index}))`,
              parameters: {
                [`contextIndexId${index}`]: indexOrdinals.documentIndexId,
                [`contextOrdinals${index}`]: indexOrdinals.neighborOrdinals,
              },
            }))
            .reduce((queryConditions, clause, index) => {
              if (index === 0) return queryConditions.where(clause.condition, clause.parameters)

              return queryConditions.orWhere(clause.condition, clause.parameters)
            }, neighborConditions),
        ),
      )
      .getMany()

    return contextRecords.map((contextRecord) => ({
      id: contextRecord.id,
      documentIndexId: contextRecord.documentIndexId,
      ordinal: contextRecord.ordinal,
      headingPath: contextRecord.headingPath,
      content: contextRecord.content,
      tokenCount: contextRecord.tokenCount,
      embedding: contextRecord.embedding,
      searchVector: contextRecord.searchVector ? [contextRecord.searchVector] : [],
      blockStart: contextRecord.blockStart,
    }))
  }

  private async loadSnapshotIn(manager: EntityManager, input: HybridRetrieveDto): Promise<RetrievalSnapshot> {
    const membershipRecords = await manager
      .getRepository(RagMembershipModel)
      .createQueryBuilder('membership')
      .innerJoinAndSelect('membership.knowledgeBase', 'knowledgeBase')
      .innerJoinAndSelect('membership.document', 'document')
      .where('knowledgeBase.projectId = :projectId', { projectId: input.projectId })
      .getMany()
    const knowledgeBaseId = membershipRecords[0]?.knowledgeBaseId ?? null

    if (!knowledgeBaseId)
      return {
        knowledgeBaseId: null,
        memberships: [],
        documents: [],
        chunks: [],
        chunkCountsByIndexId: {},
        lexicalCandidateChunkIds: [],
        indexes: [],
        revisions: [],
        relations: [],
      }

    const activeDocumentIndexIds = membershipRecords.flatMap((membershipRecord) =>
      membershipRecord.activeDocumentIndexId ? [membershipRecord.activeDocumentIndexId] : [],
    )
    const indexData = await this.loadActiveIndexData(manager, activeDocumentIndexIds, membershipRecords, input)
    const chunkCounts = activeDocumentIndexIds.length
      ? await manager
          .getRepository(RagChunkModel)
          .createQueryBuilder('chunk')
          .select('chunk.documentIndexId', 'index_id')
          .addSelect('COUNT(chunk.id)', 'chunk_count')
          .where('chunk.documentIndexId IN (:...activeDocumentIndexIds)', { activeDocumentIndexIds })
          .groupBy('chunk.documentIndexId')
          .getRawMany<{ index_id: string; chunk_count: string }>()
      : []

    return {
      knowledgeBaseId,
      memberships: membershipRecords.map((membershipRecord) => ({
        documentId: membershipRecord.documentId,
        activeDocumentIndexId: membershipRecord.activeDocumentIndexId,
        isEntry: membershipRecord.isEntry,
        alwaysIncludeFullContent: membershipRecord.alwaysIncludeFullContent,
      })),
      documents: membershipRecords.map((membershipRecord) => ({
        id: membershipRecord.documentId,
        sourcePath: membershipRecord.document.sourcePath,
        sourceType: membershipRecord.document.sourceType as RagSourceTypeEnum,
      })),
      chunks: indexData.chunks,
      chunkCountsByIndexId: Object.fromEntries(
        chunkCounts.map((chunkCount) => [chunkCount.index_id, Number(chunkCount.chunk_count)]),
      ),
      lexicalCandidateChunkIds: indexData.lexicalCandidateChunkIds,
      indexes: indexData.indexes,
      revisions: indexData.revisions,
      relations: indexData.relations,
    }
  }

  private async findHybridCandidatesIn(
    manager: EntityManager,
    input: HybridRetrieveDto,
    queryVector: number[],
    activeIndexIds: string[],
    limits: { vectorLimit: number; lexicalLimit: number },
  ): Promise<HybridCandidate[]> {
    if (!activeIndexIds.length) return []

    const membershipScope = manager
      .getRepository(RagMembershipModel)
      .createQueryBuilder('membership')
      .innerJoin('membership.knowledgeBase', 'knowledgeBase')
      .innerJoin('membership.document', 'document')
      .innerJoin(RagDocumentIndexModel, 'documentIndex', 'documentIndex.id = membership.activeDocumentIndexId')
      .innerJoin(RagChunkModel, 'chunk', 'chunk.documentIndexId = documentIndex.id')
      .where('knowledgeBase.projectId = :projectId', { projectId: input.projectId })
      .andWhere('membership.activeDocumentIndexId IN (:...activeIndexIds)', { activeIndexIds })

    const vectorRecords = await membershipScope
      .clone()
      .select('chunk.id', 'chunk_id')
      .addSelect('1 - (chunk.embedding <=> CAST(:queryVector AS vector))', 'semantic_score')
      .setParameter('queryVector', `[${queryVector.join(',')}]`)
      .orderBy('chunk.embedding <=> CAST(:queryVector AS vector)', 'ASC')
      .limit(limits.vectorLimit)
      .getRawMany<{ chunk_id: string; semantic_score: string }>()
    const queryTerms = [
      ...new Intl.Segmenter('zh-Hant', { granularity: 'word' }).segment(input.queryText.toLocaleLowerCase('zh-Hant')),
    ]
      .filter((segment) => segment.isWordLike)
      .map((segment) => segment.segment)
    const lexicalRecords = queryTerms.length
      ? await membershipScope
          .clone()
          .select('chunk.id', 'chunk_id')
          .addSelect("ts_rank(chunk.searchVector, plainto_tsquery('simple', :queryTerms))", 'lexical_score')
          .andWhere("chunk.searchVector @@ plainto_tsquery('simple', :queryTerms)", {
            queryTerms: queryTerms.join(' '),
          })
          .orderBy('lexical_score', 'DESC')
          .limit(limits.lexicalLimit)
          .getRawMany<{ chunk_id: string; lexical_score: string }>()
      : []
    const allRankedIds = [
      ...new Set([...vectorRecords, ...lexicalRecords].map((candidateRecord) => candidateRecord.chunk_id)),
    ]

    if (!allRankedIds.length) return []

    const candidateChunks = await manager.getRepository(RagChunkModel).findBy({ id: In(allRankedIds) })
    const chunkById = new Map(candidateChunks.map((chunkRecord) => [chunkRecord.id, chunkRecord]))
    const semanticRankById = new Map(
      vectorRecords.map((candidateRecord, position) => [candidateRecord.chunk_id, position + 1]),
    )
    const lexicalRankById = new Map(
      lexicalRecords.map((candidateRecord, position) => [candidateRecord.chunk_id, position + 1]),
    )
    const semanticScoreById = new Map(
      vectorRecords.map((candidateRecord) => [candidateRecord.chunk_id, Number(candidateRecord.semantic_score)]),
    )
    const lexicalScoreById = new Map(
      lexicalRecords.map((candidateRecord) => [candidateRecord.chunk_id, Number(candidateRecord.lexical_score)]),
    )

    return allRankedIds.flatMap((chunkId) => {
      const chunkRecord = chunkById.get(chunkId)

      if (!chunkRecord) return []

      return [
        {
          chunk: {
            id: chunkRecord.id,
            documentIndexId: chunkRecord.documentIndexId,
            ordinal: chunkRecord.ordinal,
            headingPath: chunkRecord.headingPath,
            content: chunkRecord.content,
            tokenCount: chunkRecord.tokenCount,
            embedding: chunkRecord.embedding,
            searchVector: chunkRecord.searchVector ? [chunkRecord.searchVector] : [],
            blockStart: chunkRecord.blockStart,
          },
          semanticScore: semanticScoreById.get(chunkId) ?? 0,
          lexicalScore: lexicalScoreById.get(chunkId) ?? 0,
          semanticRank: semanticRankById.get(chunkId) ?? null,
          lexicalRank: lexicalRankById.get(chunkId) ?? null,
        },
      ]
    })
  }

  private async loadActiveIndexData(
    manager: EntityManager,
    activeDocumentIndexIds: string[],
    membershipRecords: RagMembershipModel[],
    input?: HybridRetrieveDto,
  ): Promise<Pick<RetrievalSnapshot, 'indexes' | 'revisions' | 'chunks' | 'relations' | 'lexicalCandidateChunkIds'>> {
    if (activeDocumentIndexIds.length === 0) {
      return { indexes: [], revisions: [], chunks: [], relations: [], lexicalCandidateChunkIds: [] }
    }

    const indexRecords = await manager
      .getRepository(RagMembershipModel)
      .createQueryBuilder('membership')
      .innerJoin(RagDocumentIndexModel, 'documentIndex', 'documentIndex.id = membership.activeDocumentIndexId')
      .select('documentIndex.id', 'documentIndex_id')
      .addSelect('documentIndex.documentId', 'documentIndex_documentId')
      .addSelect('documentIndex.revisionId', 'documentIndex_revisionId')
      .addSelect('documentIndex.chunkingProfile', 'documentIndex_chunkingProfile')
      .addSelect('documentIndex.embeddingModel', 'documentIndex_embeddingModel')
      .addSelect('documentIndex.embeddingDimensions', 'documentIndex_embeddingDimensions')
      .addSelect('documentIndex.lexicalProfile', 'documentIndex_lexicalProfile')
      .addSelect('documentIndex.readyAt', 'documentIndex_readyAt')
      .where('membership.activeDocumentIndexId IN (:...activeDocumentIndexIds)', { activeDocumentIndexIds })
      .getRawMany<{
        documentIndex_id: string
        documentIndex_documentId: string
        documentIndex_revisionId: string
        documentIndex_chunkingProfile: string
        documentIndex_embeddingModel: string
        documentIndex_embeddingDimensions: number
        documentIndex_lexicalProfile: string
        documentIndex_readyAt: Date | null
      }>()
    const revisionRecords = await manager
      .getRepository(RagMembershipModel)
      .createQueryBuilder('membership')
      .innerJoin(RagDocumentIndexModel, 'documentIndex', 'documentIndex.id = membership.activeDocumentIndexId')
      .innerJoin(RagDocumentRevisionModel, 'revision', 'revision.id = documentIndex.revisionId')
      .innerJoin('membership.document', 'document')
      .select('revision.id', 'revision_id')
      .addSelect('revision.contentSha256', 'revision_contentSha256')
      .addSelect('document.currentTitle', 'revision_title')
      .addSelect('revision.content', 'revision_content')
      .where('membership.activeDocumentIndexId IN (:...activeDocumentIndexIds)', { activeDocumentIndexIds })
      .getRawMany<{
        revision_id: string
        revision_contentSha256: string
        revision_title: string | null
        revision_content: string | null
      }>()
    const queryTerms = input?.queryText
      ? [
          ...new Intl.Segmenter('zh-Hant', { granularity: 'word' }).segment(
            input.queryText.toLocaleLowerCase('zh-Hant'),
          ),
        ]
          .filter((segment) => segment.isWordLike)
          .map((segment) => segment.segment)
      : []

    const lexicalCandidateRecords =
      queryTerms.length && activeDocumentIndexIds.length
        ? await manager
            .getRepository(RagChunkModel)
            .createQueryBuilder('chunk')
            .select('chunk.id', 'chunk_id')
            .addSelect("ts_rank(chunk.searchVector, plainto_tsquery('simple', :queryTerms))", 'lexical_score')
            .where('chunk.documentIndexId IN (:...activeDocumentIndexIds)', { activeDocumentIndexIds })
            .andWhere("chunk.searchVector @@ plainto_tsquery('simple', :queryTerms)", {
              queryTerms: queryTerms.join(' '),
            })
            .orderBy('lexical_score', 'DESC')
            .take(input?.limit ?? 20)
            .getRawMany<{ chunk_id: string; lexical_score: string }>()
        : []

    const lexicalCandidateChunkIds = lexicalCandidateRecords.map((candidateRecord) => String(candidateRecord.chunk_id))

    const requiredIndexIds = membershipRecords
      .filter((membershipRecord) => membershipRecord.alwaysIncludeFullContent || membershipRecord.isEntry)
      .flatMap((membershipRecord) =>
        membershipRecord.activeDocumentIndexId ? [membershipRecord.activeDocumentIndexId] : [],
      )

    const chunkQuery = manager
      .getRepository(RagChunkModel)
      .createQueryBuilder('chunk')
      .select('chunk.id', 'chunk_id')
      .addSelect('chunk.documentIndexId', 'chunk_documentIndexId')
      .addSelect('chunk.ordinal', 'chunk_ordinal')
      .addSelect('chunk.headingPath', 'chunk_headingPath')
      .addSelect('chunk.content', 'chunk_content')
      .addSelect('chunk.tokenCount', 'chunk_tokenCount')
      .addSelect('chunk.embedding', 'chunk_embedding')
      .addSelect('chunk.searchVector', 'chunk_searchVector')
      .addSelect('chunk.blockStart', 'chunk_blockStart')

    let chunkRecords: Record<string, unknown>[] = []

    if (requiredIndexIds.length > 0 && lexicalCandidateChunkIds.length > 0) {
      chunkRecords = await chunkQuery
        .where('chunk.documentIndexId IN (:...requiredIndexIds) OR chunk.id IN (:...lexicalCandidateChunkIds)', {
          requiredIndexIds,
          lexicalCandidateChunkIds,
        })
        .getRawMany<Record<string, unknown>>()
    } else if (requiredIndexIds.length > 0) {
      chunkRecords = await chunkQuery
        .where('chunk.documentIndexId IN (:...requiredIndexIds)', { requiredIndexIds })
        .getRawMany<Record<string, unknown>>()
    } else if (lexicalCandidateChunkIds.length > 0) {
      chunkRecords = await chunkQuery
        .where('chunk.id IN (:...lexicalCandidateChunkIds)', { lexicalCandidateChunkIds })
        .getRawMany<Record<string, unknown>>()
    }

    const relationRecords = await manager
      .getRepository(RagMembershipModel)
      .createQueryBuilder('membership')
      .innerJoin(RagDocumentIndexModel, 'documentIndex', 'documentIndex.id = membership.activeDocumentIndexId')
      .innerJoin(RagDocumentRelationModel, 'relation', 'relation.sourceIndexId = documentIndex.id')
      .select('relation.id', 'relation_id')
      .addSelect('relation.sourceIndexId', 'relation_sourceIndexId')
      .addSelect('relation.targetDocumentId', 'relation_targetDocumentId')
      .addSelect('relation.targetReference', 'relation_targetReference')
      .addSelect('relation.targetAnchor', 'relation_targetAnchor')
      .addSelect('relation.relationType', 'relation_relationType')
      .addSelect('relation.evidenceBlockStart', 'relation_evidenceBlockStart')
      .addSelect('relation.evidenceBlockEnd', 'relation_evidenceBlockEnd')
      .addSelect('relation.evidenceText', 'relation_evidenceText')
      .where('membership.activeDocumentIndexId IN (:...activeDocumentIndexIds)', { activeDocumentIndexIds })
      .getRawMany<Record<string, unknown>>()

    return {
      indexes: indexRecords.map((indexRecord) => ({
        id: indexRecord.documentIndex_id,
        documentId: indexRecord.documentIndex_documentId,
        revisionId: indexRecord.documentIndex_revisionId,
        chunkingProfile: indexRecord.documentIndex_chunkingProfile,
        embeddingModel: indexRecord.documentIndex_embeddingModel,
        embeddingDimensions: indexRecord.documentIndex_embeddingDimensions,
        lexicalProfile: indexRecord.documentIndex_lexicalProfile,
        readyAt: indexRecord.documentIndex_readyAt,
      })),
      revisions: revisionRecords.map((revisionRecord) => ({
        id: revisionRecord.revision_id,
        contentSha256: revisionRecord.revision_contentSha256,
        title: revisionRecord.revision_title,
        fullContent: revisionRecord.revision_content,
      })),
      chunks: chunkRecords.map((chunkRecord) => ({
        id: String(chunkRecord.chunk_id),
        documentIndexId: String(chunkRecord.chunk_documentIndexId),
        ordinal: Number(chunkRecord.chunk_ordinal),
        headingPath: chunkRecord.chunk_headingPath as string[],
        content: String(chunkRecord.chunk_content),
        tokenCount: chunkRecord.chunk_tokenCount === null ? null : Number(chunkRecord.chunk_tokenCount),
        embedding: chunkRecord.chunk_embedding as number[],
        searchVector: chunkRecord.chunk_searchVector ? [String(chunkRecord.chunk_searchVector)] : [],
        blockStart: Number(chunkRecord.chunk_blockStart),
      })),
      relations: relationRecords.map((relationRecord) => ({
        id: String(relationRecord.relation_id),
        sourceIndexId: String(relationRecord.relation_sourceIndexId),
        targetDocumentId: relationRecord.relation_targetDocumentId
          ? String(relationRecord.relation_targetDocumentId)
          : null,
        targetReference: String(relationRecord.relation_targetReference),
        targetAnchor: relationRecord.relation_targetAnchor ? String(relationRecord.relation_targetAnchor) : null,
        relationType: relationRecord.relation_relationType as RagRelationType,
        evidenceBlockStart: Number(relationRecord.relation_evidenceBlockStart),
        evidenceBlockEnd: Number(relationRecord.relation_evidenceBlockEnd),
        evidenceText: String(relationRecord.relation_evidenceText),
      })),
      lexicalCandidateChunkIds,
    }
  }

  async findForSourceIn(
    manager: EntityManager,
    knowledgeBaseId: string,
    documentId: string,
  ): Promise<RagMembershipModel | null> {
    return manager.getRepository(RagMembershipModel).findOneBy({ knowledgeBaseId, documentId })
  }

  async countActiveReferences(manager: EntityManager, documentIndexId: string): Promise<number> {
    return manager.getRepository(RagMembershipModel).countBy({ activeDocumentIndexId: documentIndexId })
  }
}
