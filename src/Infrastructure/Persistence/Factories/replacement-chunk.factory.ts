import { ReplacementChunkAssembler } from '../../../Application/Chunks/Assemblers/replacement-chunk.assembler.ts'
import type { MarkdownChunkPlan } from '../../../Application/Chunks/DataTransferObjects/markdown-chunk-plan.dto.ts'
import { ChunkPersistenceCountMismatchException } from '../Exceptions/chunk-persistence-count-mismatch.exception.ts'
import { ChunkPersistenceEntryMissingException } from '../Exceptions/chunk-persistence-entry-missing.exception.ts'
import { ChunkModel } from '../Models/chunk.model.ts'

export class ReplacementChunkFactory {
  static toReplacementChunkModels(
    documentIndexId: string,
    chunkPlan: MarkdownChunkPlan,
    embeddingVectors: number[][],
    lexicalSearchTexts: string[],
    createdAt: Date,
  ): ChunkModel[] {
    if (embeddingVectors.length !== chunkPlan.chunks.length || lexicalSearchTexts.length !== chunkPlan.chunks.length) {
      throw new ChunkPersistenceCountMismatchException({
        plannedChunkCount: chunkPlan.chunks.length,
        embeddingCount: embeddingVectors.length,
        lexicalTextCount: lexicalSearchTexts.length,
      })
    }

    chunkPlan.chunks.forEach((_plannedChunk, ordinal) => {
      const embedding = embeddingVectors[ordinal]
      const searchVector = lexicalSearchTexts[ordinal]

      if (embedding === undefined || searchVector === undefined) {
        throw new ChunkPersistenceEntryMissingException({ ordinal })
      }
    })

    const saveChunksQO = ReplacementChunkAssembler.toSaveChunksQueryObject(
      documentIndexId,
      chunkPlan,
      embeddingVectors,
      lexicalSearchTexts,
      createdAt,
    )

    return saveChunksQO.chunks.map((replacementChunkWrite) => Object.assign(new ChunkModel(), replacementChunkWrite))
  }
}
