import type { ReplacePlannedDocumentRelationsInputDTO } from '../../../Documents/Application/DataTransferObjects/replace-planned-document-relations-input.dto.ts'
import type { Chunk } from '../../Domain/Entities/chunk.ts'
import type { MarkdownChunkPlan } from '../DataTransferObjects/markdown-chunk-plan.dto.ts'
import type { ChunkIndexQueryObject } from '../QueryObjects/chunk.query-object.ts'
import type { InsertChunksQueryObject } from '../QueryObjects/insert-chunks.query-object.ts'

/** Projects validated replacement entities and their relation plan into write inputs. */
export class ReplacementChunkAssembler {
  static toChunkIndexQueryObject(documentIndexId: string): ChunkIndexQueryObject {
    return { documentIndexId }
  }

  static toReplacePlannedDocumentRelationsInputDTO(
    documentIndexId: string,
    markdownChunkPlan: MarkdownChunkPlan,
  ): ReplacePlannedDocumentRelationsInputDTO {
    return {
      documentIndexId,
      plannedDocumentRelations: structuredClone(markdownChunkPlan.relations),
    }
  }

  static toInsertChunksQueryObject(chunks: readonly Chunk[]): InsertChunksQueryObject {
    return { chunks: chunks.map(ReplacementChunkAssembler.toReplacementChunkWrite) }
  }

  private static toReplacementChunkWrite(replacementChunk: Chunk): InsertChunksQueryObject['chunks'][number] {
    return {
      id: replacementChunk.id,
      documentIndexId: replacementChunk.documentIndexId,
      ordinal: replacementChunk.ordinal,
      headingPath: replacementChunk.headingPath,
      content: replacementChunk.content,
      blockStart: replacementChunk.blockStart,
      blockEnd: replacementChunk.blockEnd,
      tokenCount: replacementChunk.tokenCount,
      createdAt: replacementChunk.createdAt.nativeDate,
      embedding: replacementChunk.embedding,
    }
  }
}
