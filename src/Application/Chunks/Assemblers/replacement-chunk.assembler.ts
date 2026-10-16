import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { ReplacePlannedDocumentRelationsInputDto } from '../../DocumentRelations/DataTransferObjects/replace-planned-document-relations-input.dto.ts'
import type { MarkdownChunkPlan } from '../DataTransferObjects/markdown-chunk-plan.dto.ts'
import type { ChunkIndexQueryObject } from '../QueryObjects/chunk.query-object.ts'
import type { SaveChunksQueryObject } from '../QueryObjects/save-chunks.query-object.ts'

/** Projects validated replacement entities and their relation plan into write inputs. */
export class ReplacementChunkAssembler {
  static toChunkIndexQueryObject(documentIndexId: string): ChunkIndexQueryObject {
    return { documentIndexId }
  }

  static toReplacePlannedDocumentRelationsInputDTO(
    documentIndexId: string,
    markdownChunkPlan: MarkdownChunkPlan,
  ): ReplacePlannedDocumentRelationsInputDto {
    return {
      documentIndexId,
      plannedDocumentRelations: structuredClone(markdownChunkPlan.relations),
    }
  }

  static toSaveChunksQueryObject(chunks: readonly Chunk[]): SaveChunksQueryObject {
    return { chunks: chunks.map(ReplacementChunkAssembler.toReplacementChunkWrite) }
  }

  private static toReplacementChunkWrite(replacementChunk: Chunk): SaveChunksQueryObject['chunks'][number] {
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
