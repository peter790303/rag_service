import { Injectable } from '@nestjs/common'
import type { Repository } from 'typeorm'

import { KnowledgeBaseRepository as KnowledgeBaseRepositoryContract } from '../../../Application/KnowledgeBases/Contracts/knowledge-base.repository.ts'
import type {
  CreateKnowledgeBaseQueryObject,
  KnowledgeBaseIdQueryObject,
  KnowledgeBaseProjectQueryObject,
  KnowledgeBaseProjectScopeQueryObject,
  SaveKnowledgeBaseQueryObject,
} from '../../../Application/KnowledgeBases/QueryObjects/knowledge-base.query-object.ts'
import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'
import { KnowledgeBaseFactory } from '../Factories/knowledge-base.factory.ts'
import { KnowledgeBaseModel } from '../Models/knowledge-base.model.ts'
import { PersistenceTransaction } from '../persistence-transaction.ts'

@Injectable()
export class KnowledgeBaseRepository extends KnowledgeBaseRepositoryContract {
  constructor(private readonly persistenceTransaction: PersistenceTransaction) {
    super()
  }

  private get knowledgeBaseModelRepository(): Repository<KnowledgeBaseModel> {
    return this.persistenceTransaction.manager.getRepository(KnowledgeBaseModel)
  }

  async lockByKnowledgeBaseId(knowledgeBaseIdQO: KnowledgeBaseIdQueryObject): Promise<KnowledgeBase | null> {
    const knowledgeBase = await this.knowledgeBaseModelRepository.findOne({
      where: { id: knowledgeBaseIdQO.knowledgeBaseId },
      lock: { mode: 'pessimistic_write' },
    })

    return knowledgeBase ? KnowledgeBaseFactory.toKnowledgeBase(knowledgeBase) : null
  }

  async create(createKnowledgeBaseQO: CreateKnowledgeBaseQueryObject): Promise<void> {
    await this.knowledgeBaseModelRepository.insert({
      id: createKnowledgeBaseQO.knowledgeBaseId,
      projectId: createKnowledgeBaseQO.projectId,
      projectName: createKnowledgeBaseQO.projectName,
      createdAt: createKnowledgeBaseQO.createdAt,
      updatedAt: createKnowledgeBaseQO.updatedAt,
    })
  }

  async save(saveKnowledgeBaseQO: SaveKnowledgeBaseQueryObject): Promise<void> {
    await this.knowledgeBaseModelRepository.save({
      id: saveKnowledgeBaseQO.knowledgeBaseId,
      projectId: saveKnowledgeBaseQO.projectId,
      projectName: saveKnowledgeBaseQO.projectName,
      updatedAt: saveKnowledgeBaseQO.updatedAt,
    })
  }

  async findByKnowledgeBaseIdAndProjectId(
    knowledgeBaseProjectScopeQO: KnowledgeBaseProjectScopeQueryObject,
  ): Promise<KnowledgeBase | null> {
    const knowledgeBase = await this.knowledgeBaseModelRepository.findOneBy({
      id: knowledgeBaseProjectScopeQO.knowledgeBaseId,
      projectId: knowledgeBaseProjectScopeQO.projectId,
    })

    return knowledgeBase ? KnowledgeBaseFactory.toKnowledgeBase(knowledgeBase) : null
  }

  async findByKnowledgeBaseId(knowledgeBaseIdQO: KnowledgeBaseIdQueryObject): Promise<KnowledgeBase | null> {
    const knowledgeBase = await this.knowledgeBaseModelRepository.findOneBy({ id: knowledgeBaseIdQO.knowledgeBaseId })

    return knowledgeBase ? KnowledgeBaseFactory.toKnowledgeBase(knowledgeBase) : null
  }

  async findByProjectId(knowledgeBaseProjectQO: KnowledgeBaseProjectQueryObject): Promise<KnowledgeBase | null> {
    const knowledgeBase = await this.knowledgeBaseModelRepository.findOneBy({
      projectId: knowledgeBaseProjectQO.projectId,
    })

    return knowledgeBase ? KnowledgeBaseFactory.toKnowledgeBase(knowledgeBase) : null
  }
}
