import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { ChunkIndexIdsQueryObject } from '../QueryObjects/chunk.query-object.ts'
import type { ChunkIndexQueryObject } from '../QueryObjects/chunk.query-object.ts'
import type { ChunkRetrievalCandidatesQueryObject } from '../QueryObjects/chunk.query-object.ts'
import type { ChunkIndexOrdinalsQueryObject } from '../QueryObjects/chunk.query-object.ts'
import type { ChunkVectorSimilarityQueryObject } from '../QueryObjects/chunk.query-object.ts'
import type { SaveChunksQueryObject } from '../QueryObjects/save-chunks.query-object.ts'

export abstract class ChunkRepository {
  abstract saveChunks(saveChunksQO: SaveChunksQueryObject): Promise<void>

  abstract findByDocumentIndexId(chunkIndexQO: ChunkIndexQueryObject): Promise<Chunk[]>

  abstract removeByDocumentIndexId(chunkIndexQO: ChunkIndexQueryObject): Promise<void>

  abstract findByDocumentIndexIdsAndChunkIds(
    chunkRetrievalCandidatesQO: ChunkRetrievalCandidatesQueryObject,
  ): Promise<Chunk[]>

  abstract findByDocumentIndexIdAndOrdinals(chunkIndexOrdinalsQO: ChunkIndexOrdinalsQueryObject): Promise<Chunk[]>

  abstract findByDocumentIndexIdsOrderByDocumentIndexIdAscAndOrdinalAsc(
    chunkIndexIdsQO: ChunkIndexIdsQueryObject,
  ): Promise<Chunk[]>

  abstract findByDocumentIndexIds(chunkIndexIdsQO: ChunkIndexIdsQueryObject): Promise<Chunk[]>

  /**
   * 在指定 documentIndexIds 範圍內，以 queryVector 計算 cosine distance 候選。
   * 距離越小越接近；同距離依 id ASC 排序，最多回傳 limit 筆。
   * 每個 Chunk 保存本次 queryVector 的原始 cosine distance；不是相關性分數。
   */
  abstract findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc(
    chunkVectorSimilarityQO: ChunkVectorSimilarityQueryObject,
  ): Promise<Chunk[]>
}
