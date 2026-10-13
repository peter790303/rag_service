import { Injectable } from '@nestjs/common'
import { type EntityManager, Repository } from 'typeorm'

import type { MarkdownPlan } from '../../../Domain/Knowledge/markdown-chunk.factory.js'
import { RagChunkModel } from '../Models/rag-chunk.model.js'

const lexicalSegmenter = new Intl.Segmenter('zh-Hant', { granularity: 'word' })
const lexicalTerms = (text: string): string[] =>
  [...lexicalSegmenter.segment(text.toLocaleLowerCase('zh-Hant'))]
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment)

/** Chunk-primary persistence operations. */
@Injectable()
export class TypeOrmRagChunkRepository {
  async replaceForIndex(
    manager: EntityManager,
    documentIndexId: string,
    plan: MarkdownPlan,
    vectors: number[][],
  ): Promise<void> {
    const chunkRepository: Repository<RagChunkModel> = manager.getRepository(RagChunkModel)
    const existingChunks = await chunkRepository.findBy({ documentIndexId })

    if (existingChunks.length) await chunkRepository.remove(existingChunks)

    const plannedChunks = plan.chunks.map((plannedChunk, ordinal) =>
      chunkRepository.create({
        documentIndexId,
        ordinal,
        headingPath: plannedChunk.headingPath,
        content: plannedChunk.content,
        blockStart: plannedChunk.blockStart,
        blockEnd: plannedChunk.blockEnd,
        tokenCount: plannedChunk.tokenCount,
        embedding: vectors[ordinal] ?? [],
        searchVector: lexicalTerms(plannedChunk.content).join(' '),
      }),
    )

    if (plannedChunks.length) await chunkRepository.save(plannedChunks)
  }

  async findForIndex(manager: EntityManager, documentIndexId: string): Promise<RagChunkModel[]> {
    return manager.getRepository(RagChunkModel).findBy({ documentIndexId })
  }

  async removeForIndex(manager: EntityManager, documentIndexId: string): Promise<void> {
    const chunkRepository = manager.getRepository(RagChunkModel)
    const indexChunks = await chunkRepository.findBy({ documentIndexId })

    if (indexChunks.length) await chunkRepository.remove(indexChunks)
  }
}
