import type { ChunkIndexIdsQueryObject } from '../QueryObjects/chunk.query-object.ts'

/** Maps index scopes selected by the caller into chunk repository queries. */
export class QueryRetrievalIndexChunkAssembler {
  static toChunkIndexIdsQueryObject(documentIndexIds: readonly string[]): ChunkIndexIdsQueryObject {
    return { documentIndexIds: [...documentIndexIds] }
  }
}
