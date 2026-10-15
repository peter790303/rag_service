import { randomUUID } from 'node:crypto'

import { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { ReplacePlannedDocumentRelationsInputDto } from '../../DocumentRelations/DataTransferObjects/replace-planned-document-relations-input.dto.ts'
import type { MarkdownChunkPlan } from '../DataTransferObjects/markdown-chunk-plan.dto.ts'
import type { PlannedMarkdownChunk } from '../DataTransferObjects/planned-markdown-chunk.dto.ts'
import { IncompleteChunkReplacementOutputException } from '../Exceptions/incomplete-chunk-replacement-output.exception.ts'
import type { ChunkIndexQueryObject } from '../QueryObjects/chunk.query-object.ts'
import type { SaveChunksQueryObject } from '../QueryObjects/save-chunks.query-object.ts'

/** Maps a validated Markdown plan and aligned provider outputs into persistence rows. */
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

  static toSaveChunksQueryObject(
    documentIndexId: string,
    markdownChunkPlan: MarkdownChunkPlan,
    chunkEmbeddings: readonly number[][],
    lexicalSearchTexts: readonly string[],
    createdAt: Date,
  ): SaveChunksQueryObject {
    const toReplacementChunkWriteAtOrdinal = (
      plannedChunk: PlannedMarkdownChunk,
      ordinal: number,
    ): SaveChunksQueryObject['chunks'][number] => {
      const embedding = chunkEmbeddings[ordinal]
      const searchVector = lexicalSearchTexts[ordinal]

      if (embedding === undefined || searchVector === undefined)
        throw new IncompleteChunkReplacementOutputException({ ordinal })

      const replacementChunkWrite = ReplacementChunkAssembler.toReplacementChunkWrite(
        documentIndexId,
        plannedChunk,
        ordinal,
        embedding,
        searchVector,
        createdAt,
      )

      return replacementChunkWrite
    }
    const replacementChunkWrites = markdownChunkPlan.chunks.map(toReplacementChunkWriteAtOrdinal)

    return { chunks: replacementChunkWrites }
  }

  private static toReplacementChunkWrite(
    documentIndexId: string,
    plannedChunk: PlannedMarkdownChunk,
    ordinal: number,
    embedding: readonly number[],
    searchVector: string,
    createdAt: Date,
  ): SaveChunksQueryObject['chunks'][number] {
    const replacementChunk = new Chunk({
      id: randomUUID(),
      documentIndexId,
      ordinal,
      headingPath: plannedChunk.headingPath,
      content: plannedChunk.content,
      blockStart: plannedChunk.blockStart,
      blockEnd: plannedChunk.blockEnd,
      tokenCount: plannedChunk.tokenCount,
      embedding,
      searchVector,
      createdAt,
    })

    return {
      id: replacementChunk.id,
      documentIndexId: replacementChunk.documentIndexId,
      ordinal: replacementChunk.ordinal,
      headingPath: replacementChunk.headingPath,
      content: replacementChunk.content,
      blockStart: replacementChunk.blockStart,
      blockEnd: replacementChunk.blockEnd,
      tokenCount: replacementChunk.tokenCount,
      createdAt: replacementChunk.createdAt,
      embedding: replacementChunk.embedding,
      searchVector: replacementChunk.searchVector ?? '',
    }
  }
}
