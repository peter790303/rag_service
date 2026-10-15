import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { In } from 'typeorm'
import type { Repository } from 'typeorm'

import { ChunkRepository as ChunkRepositoryContract } from '../../../Application/Chunks/Contracts/chunk.repository.ts'
import type {
  ChunkVectorSimilarityQueryObject,
  ChunkIndexIdsQueryObject,
  ChunkIndexQueryObject,
  ChunkRetrievalCandidatesQueryObject,
  ChunkIndexOrdinalsQueryObject,
} from '../../../Application/Chunks/QueryObjects/chunk.query-object.ts'
import type { SaveChunksQueryObject } from '../../../Application/Chunks/QueryObjects/save-chunks.query-object.ts'
import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import { RETRIEVAL_READONLY_DATA_SOURCE } from '../../Providers/retrieval-readonly-data-source.options.ts'
import { ChunkSearchResultAdapter } from '../Adapters/chunk-search-result.adapter.ts'
import type { ChunkSemanticQueryRowDto } from '../Adapters/chunk-search-result.adapter.ts'
import { ReadTransactionDataSourceMismatchException } from '../Exceptions/read-transaction-data-source-mismatch.exception.ts'
import { ReadTransactionNotActiveException } from '../Exceptions/read-transaction-not-active.exception.ts'
import { ChunkFactory } from '../Factories/chunk.factory.ts'
import { ChunkModel } from '../Models/chunk.model.ts'
import { PersistenceTransaction } from '../persistence-transaction.ts'

/** Chunk-primary persistence operations. */
@Injectable()
export class ChunkRepository extends ChunkRepositoryContract {
  constructor(
    private readonly persistenceTransaction: PersistenceTransaction,
    @InjectDataSource(RETRIEVAL_READONLY_DATA_SOURCE) private readonly retrievalDataSource: DataSource,
  ) {
    super()
  }

  private get chunkModelRepository(): Repository<ChunkModel> {
    return this.persistenceTransaction.manager.getRepository(ChunkModel)
  }

  async saveChunks(saveChunksQO: SaveChunksQueryObject): Promise<void> {
    if (!saveChunksQO.chunks.length) return

    await this.chunkModelRepository.save([...saveChunksQO.chunks])
  }

  async findByDocumentIndexId(chunkIndexQO: ChunkIndexQueryObject): Promise<Chunk[]> {
    const persistedChunks = await this.chunkModelRepository.findBy({ documentIndexId: chunkIndexQO.documentIndexId })

    return persistedChunks.map(ChunkFactory.toChunk)
  }

  async removeByDocumentIndexId(chunkIndexQO: ChunkIndexQueryObject): Promise<void> {
    await this.chunkModelRepository.delete({ documentIndexId: chunkIndexQO.documentIndexId })
  }

  async findByDocumentIndexIdsAndChunkIds(
    chunkRetrievalCandidatesQO: ChunkRetrievalCandidatesQueryObject,
  ): Promise<Chunk[]> {
    if (!chunkRetrievalCandidatesQO.documentIndexIds.length || !chunkRetrievalCandidatesQO.chunkIds.length) return []

    const persistedChunks = await this.chunkModelRepository.findBy({
      documentIndexId: In(chunkRetrievalCandidatesQO.documentIndexIds),
      id: In(chunkRetrievalCandidatesQO.chunkIds),
    })

    return persistedChunks.map(ChunkFactory.toChunk)
  }

  async findByDocumentIndexIdAndOrdinals(chunkIndexOrdinalsQO: ChunkIndexOrdinalsQueryObject): Promise<Chunk[]> {
    if (!chunkIndexOrdinalsQO.ordinals.length) return []

    const persistedChunks = await this.chunkModelRepository.findBy({
      documentIndexId: chunkIndexOrdinalsQO.documentIndexId,
      ordinal: In(chunkIndexOrdinalsQO.ordinals),
    })

    return persistedChunks.map(ChunkFactory.toChunk)
  }

  async findByDocumentIndexIdsOrderByDocumentIndexIdAscAndOrdinalAsc(
    chunkIndexIdsQO: ChunkIndexIdsQueryObject,
  ): Promise<Chunk[]> {
    if (!chunkIndexIdsQO.documentIndexIds.length) return []

    const persistedChunks = await this.chunkModelRepository.find({
      where: { documentIndexId: In(chunkIndexIdsQO.documentIndexIds) },
      order: { documentIndexId: 'ASC', ordinal: 'ASC' },
    })

    return persistedChunks.map(ChunkFactory.toChunk)
  }

  async findByDocumentIndexIds(chunkIndexIdsQO: ChunkIndexIdsQueryObject): Promise<Chunk[]> {
    if (!chunkIndexIdsQO.documentIndexIds.length) return []

    const persistedChunks = await this.chunkModelRepository.findBy({
      documentIndexId: In(chunkIndexIdsQO.documentIndexIds),
    })

    return persistedChunks.map(ChunkFactory.toChunk)
  }

  async findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc(
    chunkVectorSimilarityQO: ChunkVectorSimilarityQueryObject,
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
    // 範圍與退出條件：[向量查詢例外](../../../../../../Documents/Worker/BackEnd/Rag-Service/CODING_STANDARDS.md#向量查詢例外)。
    const semanticCandidateChunks = await manager.query<ChunkSemanticQueryRowDto[]>(
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
        JSON.stringify(chunkVectorSimilarityQO.queryVector),
        chunkVectorSimilarityQO.documentIndexIds,
        chunkVectorSimilarityQO.limit,
      ],
    )

    return ChunkSearchResultAdapter.toVectorMatchedChunks(semanticCandidateChunks, chunkVectorSimilarityQO.queryVector)
  }
}
