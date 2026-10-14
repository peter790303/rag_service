import { Injectable } from '@nestjs/common'
import { Brackets, In } from 'typeorm'
import type { EntityManager } from 'typeorm'

import type {
  RagChunkLexicalQuery,
  RagChunkSemanticQuery,
} from '../../../Application/KnowledgeBases/Contracts/rag-chunk-repository.port.js'
import type { RagChunkReplacementWrite } from '../../../Application/KnowledgeBases/Contracts/rag-index-chunk-replacement-store.js'
import type { RagRetrievalContextCriteria } from '../../../Application/KnowledgeBases/Contracts/rag-retrieval-store.js'
import type { RagChunkCandidateRows } from '../Contracts/rag-chunk-candidate-rows.js'
import { RagChunkModel } from '../Models/rag-chunk.model.js'

/** Chunk-primary persistence operations. */
@Injectable()
export class TypeOrmRagChunkRepository {
  async saveRowsIn(manager: EntityManager, rows: readonly RagChunkReplacementWrite[]): Promise<void> {
    if (!rows.length) return

    const repository = manager.getRepository(RagChunkModel)
    await repository.save(rows.map((row) => repository.create({ ...row })))
  }

  async findForIndex(manager: EntityManager, documentIndexId: string): Promise<RagChunkModel[]> {
    return manager.getRepository(RagChunkModel).findBy({ documentIndexId })
  }

  async removeForIndex(manager: EntityManager, documentIndexId: string): Promise<void> {
    const chunkRepository = manager.getRepository(RagChunkModel)
    const indexChunks = await chunkRepository.findBy({ documentIndexId })

    if (indexChunks.length) await chunkRepository.remove(indexChunks)
  }

  async findRetrievalContextIn(
    manager: EntityManager,
    contextCriteria: RagRetrievalContextCriteria,
    activeIndexIds: string[],
  ): Promise<RagChunkModel[]> {
    if (!contextCriteria.length || !activeIndexIds.length) return []

    return manager
      .getRepository(RagChunkModel)
      .createQueryBuilder('contextChunk')
      .where('contextChunk.documentIndexId IN (:...activeIndexIds)', { activeIndexIds })
      .andWhere(
        new Brackets((neighborConditions) =>
          contextCriteria
            .map((criteria, index) => ({
              condition: `(contextChunk.documentIndexId = :contextIndexId${index} AND contextChunk.ordinal IN (:...contextOrdinals${index}))`,
              parameters: {
                [`contextIndexId${index}`]: criteria.documentIndexId,
                [`contextOrdinals${index}`]: criteria.ordinals,
              },
            }))
            .reduce((queryConditions, clause, index) => {
              if (index === 0) return queryConditions.where(clause.condition, clause.parameters)

              return queryConditions.orWhere(clause.condition, clause.parameters)
            }, neighborConditions),
        ),
      )
      .getMany()
  }

  async findSemanticCandidateRowsIn(
    manager: EntityManager,
    query: RagChunkSemanticQuery,
  ): Promise<RagChunkCandidateRows> {
    if (!query.documentIndexIds.length) return { entities: [], raw: [] }

    return manager
      .getRepository(RagChunkModel)
      .createQueryBuilder('chunk')
      .where('chunk.documentIndexId IN (:...documentIndexIds)', { documentIndexIds: query.documentIndexIds })
      .addSelect('chunk.id', 'chunk_id')
      .addSelect('1 - (chunk.embedding <=> CAST(:queryVector AS vector))', 'candidate_score')
      .setParameter('queryVector', `[${query.queryVector.join(',')}]`)
      .orderBy('chunk.embedding <=> CAST(:queryVector AS vector)', 'ASC')
      .addOrderBy('chunk.id', 'ASC')
      .limit(query.limit)
      .getRawAndEntities<{ chunk_id: string; candidate_score: string | number }>()
  }

  async findLexicalCandidateRowsIn(
    manager: EntityManager,
    query: RagChunkLexicalQuery,
  ): Promise<RagChunkCandidateRows> {
    if (!query.documentIndexIds.length || !query.terms.length) return { entities: [], raw: [] }

    return manager
      .getRepository(RagChunkModel)
      .createQueryBuilder('chunk')
      .where('chunk.documentIndexId IN (:...documentIndexIds)', { documentIndexIds: query.documentIndexIds })
      .addSelect('chunk.id', 'chunk_id')
      .addSelect("ts_rank(chunk.searchVector, plainto_tsquery('simple', :queryTerms))", 'candidate_score')
      .andWhere("chunk.searchVector @@ plainto_tsquery('simple', :queryTerms)", { queryTerms: query.terms.join(' ') })
      .orderBy('candidate_score', 'DESC')
      .addOrderBy('chunk.id', 'ASC')
      .limit(query.limit)
      .getRawAndEntities<{ chunk_id: string; candidate_score: string | number }>()
  }

  async findRetrievalChunksIn(manager: EntityManager, documentIndexIds: string[]): Promise<RagChunkModel[]> {
    if (!documentIndexIds.length) return []

    return manager.getRepository(RagChunkModel).find({
      where: { documentIndexId: In(documentIndexIds) },
      order: { documentIndexId: 'ASC', ordinal: 'ASC' },
    })
  }

  async countByIndexIdsIn(manager: EntityManager, documentIndexIds: string[]): Promise<Record<string, number>> {
    if (!documentIndexIds.length) return {}

    const counts = await manager
      .getRepository(RagChunkModel)
      .createQueryBuilder('chunk')
      .select('chunk.documentIndexId', 'index_id')
      .addSelect('COUNT(chunk.id)', 'chunk_count')
      .where('chunk.documentIndexId IN (:...documentIndexIds)', { documentIndexIds })
      .groupBy('chunk.documentIndexId')
      .getRawMany<{ index_id: string; chunk_count: string }>()

    return Object.fromEntries(counts.map((count) => [count.index_id, Number(count.chunk_count)]))
  }
}
