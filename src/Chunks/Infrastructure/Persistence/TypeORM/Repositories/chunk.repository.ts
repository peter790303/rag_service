import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { In } from 'typeorm'
import type { Repository } from 'typeorm'

import { RETRIEVAL_READONLY_DATA_SOURCE } from '../../../../../Bootstrap/Nest/Providers/retrieval-readonly-data-source.options.ts'
import { LexicalSearchQueryAdapter } from '../../../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Adapters/lexical-search-query.adapter.ts'
import { ReadTransactionDataSourceMismatchException } from '../../../../../Shared/Infrastructure/Persistence/TypeORM/Exceptions/read-transaction-data-source-mismatch.exception.ts'
import { ReadTransactionNotActiveException } from '../../../../../Shared/Infrastructure/Persistence/TypeORM/Exceptions/read-transaction-not-active.exception.ts'
import { PersistenceTransaction } from '../../../../../Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import { ChunkRepository as ChunkRepositoryContract } from '../../../../Application/Ports/Out/Repositories/chunk.repository.ts'
import type {
  ChunkVectorSimilarityQO,
  ChunkLexicalSearchQO,
  ChunkIndexIdsQO,
  ChunkIndexQO,
  ChunkRetrievalCandidatesQO,
  ChunkIndexOrdinalsQO,
} from '../../../../Application/QueryObjects/chunk.query-object.ts'
import type { InsertChunksQO } from '../../../../Application/QueryObjects/insert-chunks.query-object.ts'
import type { Chunk } from '../../../../Domain/Entities/chunk.ts'
import { ChunkInsertAdapter } from '../Adapters/chunk-insert.adapter.ts'
import { ChunkSearchResultAdapter } from '../Adapters/chunk-search-result.adapter.ts'
import type { ChunkLexicalQueryRowDTO, ChunkSemanticQueryRowDTO } from '../Adapters/chunk-search-result.adapter.ts'
import { ChunkPersistenceAdapter } from '../Adapters/chunk.persistence.adapter.ts'
import { ChunkModel } from '../Models/chunk.model.ts'

/** Chunk-primary persistence operations. */
@Injectable()
export class ChunkRepository extends ChunkRepositoryContract {
  private readonly lexicalSearchQueryAdapter = new LexicalSearchQueryAdapter()

  constructor(
    private readonly persistenceTransaction: PersistenceTransaction,
    @InjectDataSource(RETRIEVAL_READONLY_DATA_SOURCE) private readonly retrievalDataSource: DataSource,
  ) {
    super()
  }

  private get chunkModelRepository(): Repository<ChunkModel> {
    return this.persistenceTransaction.manager.getRepository(ChunkModel)
  }

  async insertChunks(insertChunksQO: InsertChunksQO): Promise<void> {
    if (!insertChunksQO.chunks.length) return

    const chunkInsertPayloads = ChunkInsertAdapter.toInsertPayloads(insertChunksQO)
    await this.chunkModelRepository.insert(chunkInsertPayloads)
  }

  async findByDocumentIndexId(chunkIndexQO: ChunkIndexQO): Promise<Chunk[]> {
    const persistedChunks = await this.chunkModelRepository.findBy({ documentIndexId: chunkIndexQO.documentIndexId })

    return persistedChunks.map(ChunkPersistenceAdapter.toChunk)
  }

  async removeByDocumentIndexId(chunkIndexQO: ChunkIndexQO): Promise<void> {
    await this.chunkModelRepository.delete({ documentIndexId: chunkIndexQO.documentIndexId })
  }

  async findByDocumentIndexIdsAndChunkIds(chunkRetrievalCandidatesQO: ChunkRetrievalCandidatesQO): Promise<Chunk[]> {
    if (!chunkRetrievalCandidatesQO.documentIndexIds.length || !chunkRetrievalCandidatesQO.chunkIds.length) return []

    const persistedChunks = await this.chunkModelRepository.findBy({
      documentIndexId: In(chunkRetrievalCandidatesQO.documentIndexIds),
      id: In(chunkRetrievalCandidatesQO.chunkIds),
    })

    return persistedChunks.map(ChunkPersistenceAdapter.toChunk)
  }

  async findByDocumentIndexIdAndOrdinals(chunkIndexOrdinalsQO: ChunkIndexOrdinalsQO): Promise<Chunk[]> {
    if (!chunkIndexOrdinalsQO.ordinals.length) return []

    const persistedChunks = await this.chunkModelRepository.findBy({
      documentIndexId: chunkIndexOrdinalsQO.documentIndexId,
      ordinal: In(chunkIndexOrdinalsQO.ordinals),
    })

    return persistedChunks.map(ChunkPersistenceAdapter.toChunk)
  }

  async findByDocumentIndexIdsOrderByDocumentIndexIdAscAndOrdinalAsc(
    chunkIndexIdsQO: ChunkIndexIdsQO,
  ): Promise<Chunk[]> {
    if (!chunkIndexIdsQO.documentIndexIds.length) return []

    const persistedChunks = await this.chunkModelRepository.find({
      where: { documentIndexId: In(chunkIndexIdsQO.documentIndexIds) },
      order: { documentIndexId: 'ASC', ordinal: 'ASC' },
    })

    return persistedChunks.map(ChunkPersistenceAdapter.toChunk)
  }

  async findByDocumentIndexIds(chunkIndexIdsQO: ChunkIndexIdsQO): Promise<Chunk[]> {
    if (!chunkIndexIdsQO.documentIndexIds.length) return []

    const persistedChunks = await this.chunkModelRepository.findBy({
      documentIndexId: In(chunkIndexIdsQO.documentIndexIds),
    })

    return persistedChunks.map(ChunkPersistenceAdapter.toChunk)
  }

  async findByDocumentIndexIdsOrderByLexicalScoreDescAndIdAsc(
    chunkLexicalSearchQO: ChunkLexicalSearchQO,
  ): Promise<Chunk[]> {
    if (!chunkLexicalSearchQO.documentIndexIds.length || chunkLexicalSearchQO.limit <= 0) return []

    const lexicalQuery = this.lexicalSearchQueryAdapter.format(chunkLexicalSearchQO.queryText)

    if (!lexicalQuery.terms.length) return []

    const manager = this.persistenceTransaction.manager

    if (manager.connection !== this.retrievalDataSource) {
      throw new ReadTransactionDataSourceMismatchException()
    }

    if (!manager.queryRunner?.isTransactionActive) {
      throw new ReadTransactionNotActiveException()
    }

    const chunkMetadata = this.chunkModelRepository.metadata
    const escapedTableName = this.retrievalDataSource.driver.escape(chunkMetadata.tableName)
    const tablePath = chunkMetadata.schema
      ? `${this.retrievalDataSource.driver.escape(chunkMetadata.schema)}.${escapedTableName}`
      : escapedTableName
    // User-authorized SQL exception: RAG Hybrid lexical matching and relevance ranking only.
    // TypeORM's native find API cannot express PostgreSQL matching, dynamic ts_rank ordering, and DB limit together.
    // Keep scope, rank, tie-break, and TopK in this query: [exception](/Users/xiang/Documents/Worker/BackEnd/Rag-Service/CODING_STANDARDS.md#rag-hybrid-全文匹配與相關度排名).
    const lexicalCandidateChunks = await manager.query<ChunkLexicalQueryRowDTO[]>(
      `SELECT id, document_index_id AS "documentIndexId", ordinal,
        heading_path AS "headingPath", content, token_count AS "tokenCount",
        embedding, search_vector AS "searchVector", block_start AS "blockStart", block_end AS "blockEnd",
        created_at AS "createdAt",
        ts_rank(search_vector, plainto_tsquery('simple', $1)) AS "lexicalScore"
      FROM ${tablePath}
      WHERE document_index_id = ANY($2::uuid[])
        AND search_vector @@ plainto_tsquery('simple', $1)
      ORDER BY "lexicalScore" DESC, id ASC
      LIMIT $3`,
      [lexicalQuery.searchText, chunkLexicalSearchQO.documentIndexIds, chunkLexicalSearchQO.limit],
    )

    return ChunkSearchResultAdapter.toLexicallyMatchedChunks(lexicalCandidateChunks, chunkLexicalSearchQO.queryText)
  }

  async findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc(
    chunkVectorSimilarityQO: ChunkVectorSimilarityQO,
  ): Promise<Chunk[]> {
    if (
      !chunkVectorSimilarityQO.documentIndexIds.length ||
      !chunkVectorSimilarityQO.queryVector.length ||
      chunkVectorSimilarityQO.limit <= 0
    )
      return []

    const manager = this.persistenceTransaction.manager

    if (manager.connection !== this.retrievalDataSource) {
      throw new ReadTransactionDataSourceMismatchException()
    }

    if (!manager.queryRunner?.isTransactionActive) {
      throw new ReadTransactionNotActiveException()
    }

    const chunkMetadata = this.chunkModelRepository.metadata
    const escapedTableName = this.retrievalDataSource.driver.escape(chunkMetadata.tableName)
    const tablePath = chunkMetadata.schema
      ? `${this.retrievalDataSource.driver.escape(chunkMetadata.schema)}.${escapedTableName}`
      : escapedTableName
    // ORM 例外：僅限向量相似度查詢。已安裝 TypeORM 原生 API 無法完整表達
    // 動態向量距離投影、排序與資料庫端 limit；具備等效原生 API 並驗證後即移除 SQL。
    // 範圍與退出條件：[向量查詢例外](../../../../../../Documents/Worker/BackEnd/Rag-Service/CODING_STANDARDS.md#向量相似度)。
    const semanticCandidateChunks = await manager.query<ChunkSemanticQueryRowDTO[]>(
      `SELECT id, document_index_id AS "documentIndexId", ordinal,
        heading_path AS "headingPath", content, token_count AS "tokenCount",
        embedding, search_vector AS "searchVector", block_start AS "blockStart", block_end AS "blockEnd",
        created_at AS "createdAt",
        embedding <=> $1::vector AS "candidateDistance"
      FROM ${tablePath}
      WHERE document_index_id = ANY($2::uuid[])
      ORDER BY "candidateDistance" ASC, id ASC
      LIMIT $3`,
      [
        ChunkSearchResultAdapter.toVectorParameter(chunkVectorSimilarityQO.queryVector),
        chunkVectorSimilarityQO.documentIndexIds,
        chunkVectorSimilarityQO.limit,
      ],
    )

    return ChunkSearchResultAdapter.toVectorMatchedChunks(semanticCandidateChunks, chunkVectorSimilarityQO.queryVector)
  }
}
