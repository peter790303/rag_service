import { LexicalSearchQueryAdapter } from './lexical-search-query.adapter.ts'
import type { InsertChunksQueryObject } from '../../../Application/Chunks/QueryObjects/insert-chunks.query-object.ts'

type ChunkInsertPayload = InsertChunksQueryObject['chunks'][number] & { searchVector: string }

/** Adds the PostgreSQL lexical representation to validated chunk write inputs. */
export class ChunkInsertAdapter {
  static toInsertPayloads(insertChunksQO: InsertChunksQueryObject): ChunkInsertPayload[] {
    return insertChunksQO.chunks.map(ChunkInsertAdapter.toInsertPayload)
  }

  private static toInsertPayload(chunk: InsertChunksQueryObject['chunks'][number]): ChunkInsertPayload {
    const lexicalSearchQueryAdapter = new LexicalSearchQueryAdapter()
    const lexicalRepresentation = lexicalSearchQueryAdapter.format(chunk.content)

    return {
      id: chunk.id,
      documentIndexId: chunk.documentIndexId,
      ordinal: chunk.ordinal,
      headingPath: chunk.headingPath,
      content: chunk.content,
      blockStart: chunk.blockStart,
      blockEnd: chunk.blockEnd,
      tokenCount: chunk.tokenCount,
      embedding: chunk.embedding,
      createdAt: chunk.createdAt,
      searchVector: lexicalSearchQueryAdapter.formatSearchVector(lexicalRepresentation.terms),
    }
  }
}
