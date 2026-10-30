import type { Chunk } from '../../../../Domain/Entities/chunk.ts'
import type { ChunkIndexIdsQO } from '../../../QueryObjects/chunk.query-object.ts'
import type { ChunkIndexQO } from '../../../QueryObjects/chunk.query-object.ts'
import type { ChunkRetrievalCandidatesQO } from '../../../QueryObjects/chunk.query-object.ts'
import type { ChunkIndexOrdinalsQO } from '../../../QueryObjects/chunk.query-object.ts'
import type { ChunkLexicalSearchQO } from '../../../QueryObjects/chunk.query-object.ts'
import type { ChunkVectorSimilarityQO } from '../../../QueryObjects/chunk.query-object.ts'
import type { InsertChunksQO } from '../../../QueryObjects/insert-chunks.query-object.ts'

export abstract class ChunkRepository {
  abstract insertChunks(insertChunksQO: InsertChunksQO): Promise<void>

  abstract findByDocumentIndexId(chunkIndexQO: ChunkIndexQO): Promise<Chunk[]>

  abstract removeByDocumentIndexId(chunkIndexQO: ChunkIndexQO): Promise<void>

  abstract findByDocumentIndexIdsAndChunkIds(chunkRetrievalCandidatesQO: ChunkRetrievalCandidatesQO): Promise<Chunk[]>

  abstract findByDocumentIndexIdAndOrdinals(chunkIndexOrdinalsQO: ChunkIndexOrdinalsQO): Promise<Chunk[]>

  abstract findByDocumentIndexIdsOrderByDocumentIndexIdAscAndOrdinalAsc(
    chunkIndexIdsQO: ChunkIndexIdsQO,
  ): Promise<Chunk[]>

  abstract findByDocumentIndexIds(chunkIndexIdsQO: ChunkIndexIdsQO): Promise<Chunk[]>

  abstract findByDocumentIndexIdsOrderByLexicalScoreDescAndIdAsc(
    chunkLexicalSearchQO: ChunkLexicalSearchQO,
  ): Promise<Chunk[]>

  /**
   * 在指定 documentIndexIds 範圍內，以 queryVector 計算 cosine distance 候選。
   * 距離越小越接近；同距離依 id ASC 排序，最多回傳 limit 筆。
   * 每個 Chunk 保存本次 queryVector 的原始 cosine distance；不是相關性分數。
   */
  abstract findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc(
    chunkVectorSimilarityQO: ChunkVectorSimilarityQO,
  ): Promise<Chunk[]>
}
