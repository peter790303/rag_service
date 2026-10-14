import type { MarkdownPlan } from '../../../Domain/Knowledge/markdown-chunk.factory.js'
import { RagChunkModel } from '../Models/rag-chunk.model.js'

export class RagChunkFactory {
  static fromPlan(
    documentIndexId: string,
    plan: MarkdownPlan,
    vectors: number[][],
    lexicalSearchTexts: string[],
  ): RagChunkModel[] {
    if (vectors.length !== plan.chunks.length || lexicalSearchTexts.length !== plan.chunks.length) {
      throw new Error('Chunk persistence inputs must match the planned chunk count')
    }

    return plan.chunks.map((plannedChunk, ordinal) => {
      const embedding = vectors[ordinal]
      const searchVector = lexicalSearchTexts[ordinal]

      if (embedding === undefined || searchVector === undefined) {
        throw new Error('Chunk persistence inputs must contain every planned chunk')
      }

      return Object.assign(new RagChunkModel(), {
        documentIndexId,
        ordinal,
        headingPath: plannedChunk.headingPath,
        content: plannedChunk.content,
        blockStart: plannedChunk.blockStart,
        blockEnd: plannedChunk.blockEnd,
        tokenCount: plannedChunk.tokenCount,
        embedding,
        searchVector,
      })
    })
  }
}
