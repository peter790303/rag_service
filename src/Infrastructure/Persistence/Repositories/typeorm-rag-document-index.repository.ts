import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In } from 'typeorm'
import { EntityNotFoundError, type EntityManager, LessThanOrEqual, Repository } from 'typeorm'

import { RAG_DOCUMENT_INDEX_STATUS } from '../../../Domain/Knowledge/Enums/rag-document-index-status.enum.js'
import { RagDocumentIndexFactory } from '../Factories/rag-document-index.factory.js'
import { RagDocumentIndexModel } from '../Models/rag-document-index.model.js'
import { RagDocumentRevisionModel } from '../Models/rag-document-revision.model.js'

type BuildingRagDocumentIndexAttributes = {
  documentId: string
  revisionId: string
  pipelineHash: string
  chunkingModel: string
  chunkingProfile: string
  embeddingModel: string
  embeddingDimensions: number
  embeddingProfile: string
  lexicalProfile: string
  relationProfile: string
  status: typeof RAG_DOCUMENT_INDEX_STATUS.BUILDING
  readyAt: null
  unreferencedSince: null
}

/** Index-primary reads, with revision data loaded in the same ORM query. */
@Injectable()
export class TypeOrmRagDocumentIndexRepository {
  constructor(@InjectRepository(RagDocumentIndexModel) private readonly indexes: Repository<RagDocumentIndexModel>) {}

  async findByRevisionAndPipeline(
    manager: EntityManager,
    revisionId: string,
    pipelineHash: string,
  ): Promise<RagDocumentIndexModel | null> {
    return manager.getRepository(RagDocumentIndexModel).findOneBy({ revisionId, pipelineHash })
  }

  async createBuildingIndex(
    manager: EntityManager,
    input: BuildingRagDocumentIndexAttributes,
  ): Promise<RagDocumentIndexModel> {
    const indexRepository = manager.getRepository(RagDocumentIndexModel)

    return indexRepository.save(
      indexRepository.create({
        ...input,
      }),
    )
  }

  async lockById(manager: EntityManager, documentIndexId: string): Promise<RagDocumentIndexModel | null> {
    return manager.getRepository(RagDocumentIndexModel).findOne({
      where: { id: documentIndexId },
      lock: { mode: 'pessimistic_write' },
    })
  }

  async lockAvailableByIdIn(manager: EntityManager, documentIndexId: string): Promise<RagDocumentIndexModel | null> {
    return manager
      .getRepository(RagDocumentIndexModel)
      .createQueryBuilder('documentIndex')
      .where('documentIndex.id = :documentIndexId', { documentIndexId })
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .getOne()
  }

  async existsByIdIn(manager: EntityManager, documentIndexId: string): Promise<boolean> {
    return manager.getRepository(RagDocumentIndexModel).existsBy({ id: documentIndexId })
  }

  async lockManyById(manager: EntityManager, documentIndexIds: string[]): Promise<RagDocumentIndexModel[]> {
    const sortedIndexIds = [...new Set(documentIndexIds)].sort()

    return sortedIndexIds.reduce(async (previousLocks, documentIndexId) => {
      const lockedIndexes = await previousLocks
      const index = await this.lockById(manager, documentIndexId)

      if (index) lockedIndexes.push(index)

      return lockedIndexes
    }, Promise.resolve<RagDocumentIndexModel[]>([]))
  }

  async remove(manager: EntityManager, documentIndex: RagDocumentIndexModel): Promise<void> {
    await manager.getRepository(RagDocumentIndexModel).remove(documentIndex)
  }

  async findById(documentIndexId: string): Promise<RagDocumentIndexModel | null> {
    return this.indexes.findOneBy({ id: documentIndexId })
  }

  async findByIdIn(manager: EntityManager, documentIndexId: string): Promise<RagDocumentIndexModel | null> {
    return manager.getRepository(RagDocumentIndexModel).findOneBy({ id: documentIndexId })
  }

  async loadContent(documentIndexId: string): Promise<string> {
    const documentIndex = await this.indexes
      .createQueryBuilder('documentIndex')
      .leftJoinAndSelect('documentIndex.revision', 'revision')
      .where('documentIndex.id = :documentIndexId', { documentIndexId })
      .getOne()

    if (!documentIndex) throw new EntityNotFoundError(RagDocumentIndexModel, { id: documentIndexId })

    if (!documentIndex.revision)
      throw new EntityNotFoundError(RagDocumentRevisionModel, { id: documentIndex.revisionId })

    return documentIndex.revision.content
  }

  async markReady(manager: EntityManager, documentIndexId: string, readyAt: Date): Promise<RagDocumentIndexModel> {
    const documentIndex = await manager.getRepository(RagDocumentIndexModel).findOneOrFail({
      where: { id: documentIndexId },
      lock: { mode: 'pessimistic_write' },
    })
    const readyIndex = RagDocumentIndexFactory.toDomain(documentIndex).markReady(readyAt)

    return manager
      .getRepository(RagDocumentIndexModel)
      .save(RagDocumentIndexFactory.applyLifecycle(readyIndex, documentIndex))
  }

  async markUnreferenced(manager: EntityManager, documentIndexId: string, unreferencedSince: Date): Promise<void> {
    const documentIndex = await manager.getRepository(RagDocumentIndexModel).findOneBy({ id: documentIndexId })

    if (!documentIndex) return

    const index = RagDocumentIndexFactory.toDomain(documentIndex).markUnreferenced(unreferencedSince)
    await manager
      .getRepository(RagDocumentIndexModel)
      .save(RagDocumentIndexFactory.applyLifecycle(index, documentIndex))
  }

  async setUnreferencedSince(manager: EntityManager, documentIndexId: string, value: Date | null): Promise<void> {
    await manager.getRepository(RagDocumentIndexModel).update({ id: documentIndexId }, { unreferencedSince: value })
  }

  async removeUnreferenced(manager: EntityManager, documentIndexId: string): Promise<void> {
    await manager.getRepository(RagDocumentIndexModel).delete({ id: documentIndexId })
  }

  async countForDocumentIn(manager: EntityManager, documentId: string): Promise<number> {
    return manager.getRepository(RagDocumentIndexModel).countBy({ documentId })
  }

  async countForRevisionIn(manager: EntityManager, revisionId: string): Promise<number> {
    return manager.getRepository(RagDocumentIndexModel).countBy({ revisionId })
  }

  async findGarbageCandidatesIn(manager: EntityManager, cutoff: Date): Promise<RagDocumentIndexModel[]> {
    return manager.getRepository(RagDocumentIndexModel).find({
      where: { unreferencedSince: LessThanOrEqual(cutoff) },
      order: { id: 'ASC' },
    })
  }

  async deleteByIdIn(manager: EntityManager, documentIndexId: string): Promise<void> {
    await manager.getRepository(RagDocumentIndexModel).delete({ id: documentIndexId })
  }

  async findForDocumentIdsIn(manager: EntityManager, documentIds: string[]): Promise<RagDocumentIndexModel[]> {
    if (!documentIds.length) return []

    return manager.getRepository(RagDocumentIndexModel).find({
      where: { documentId: In(documentIds) },
      order: { createdAt: 'ASC', id: 'ASC' },
    })
  }
}
