import type { AuthorizeDocumentIndexChunkReplacementCommand } from '../../../DocumentIndexes/Application/Commands/authorize-document-index-chunk-replacement.command.ts'
import type { AuthorizeDocumentIndexChunkReplacementInputDTO } from '../../../DocumentIndexes/Application/DTOs/authorize-document-index-chunk-replacement-input.dto.ts'
import type { ReplacePlannedDocumentRelationsCommand } from '../../../DocumentRelations/Application/Commands/replace-planned-document-relations.command.ts'
import type { Chunk } from '../../Domain/Entities/chunk.ts'
import type { MarkdownChunkPlan } from '../DTOs/markdown-chunk-plan.dto.ts'
import type { ChunkIndexQO } from '../QueryObjects/chunk.query-object.ts'
import type { InsertChunksQO } from '../QueryObjects/insert-chunks.query-object.ts'

/** Projects validated replacement entities and their relation plan into write inputs. */
export class ReplacementChunkAssembler {
  static toAuthorizeDocumentIndexChunkReplacementCommand(
    inputDTO: AuthorizeDocumentIndexChunkReplacementInputDTO,
  ): AuthorizeDocumentIndexChunkReplacementCommand {
    const delivery = inputDTO.delivery

    return {
      delivery: {
        id: delivery.id,
        knowledgeBaseId: delivery.knowledgeBaseId,
        documentId: delivery.documentId,
        documentIndexId: delivery.documentIndexId,
        generation: delivery.generation,
        attempts: delivery.attempts,
        leaseToken: delivery.leaseToken,
        leaseExpiresAt: delivery.leaseExpiresAt,
      },
    }
  }

  static toChunkIndexQO(documentIndexId: string): ChunkIndexQO {
    return { documentIndexId }
  }

  static toReplacePlannedDocumentRelationsCommand(
    documentIndexId: string,
    markdownChunkPlan: MarkdownChunkPlan,
  ): ReplacePlannedDocumentRelationsCommand {
    return {
      documentIndexId,
      plannedDocumentRelations: structuredClone(markdownChunkPlan.relations),
    }
  }

  static toInsertChunksQO(chunks: readonly Chunk[]): InsertChunksQO {
    return { chunks: chunks.map(ReplacementChunkAssembler.toReplacementChunkWrite) }
  }

  private static toReplacementChunkWrite(replacementChunk: Chunk): InsertChunksQO['chunks'][number] {
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
