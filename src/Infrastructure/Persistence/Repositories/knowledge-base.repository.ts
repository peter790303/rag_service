import { Injectable } from '@nestjs/common'
import type { Repository } from 'typeorm'

import { KnowledgeBaseRepository as KnowledgeBaseRepositoryContract } from '../../../Application/KnowledgeBases/Contracts/knowledge-base.repository.ts'
import type {
  CreateKnowledgeBaseQueryObject,
  KnowledgeBaseIdQueryObject,
  KnowledgeBaseProjectQueryObject,
  KnowledgeBaseProjectScopeQueryObject,
  UpdateKnowledgeBaseQueryObject,
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

  async update(updateKnowledgeBaseQO: UpdateKnowledgeBaseQueryObject): Promise<void> {
    await this.knowledgeBaseModelRepository.update(
      { id: updateKnowledgeBaseQO.knowledgeBaseId },
      {
        projectId: updateKnowledgeBaseQO.projectId,
        projectName: updateKnowledgeBaseQO.projectName,
        updatedAt: updateKnowledgeBaseQO.updatedAt,
      },
    )
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

  async list(): Promise<readonly KnowledgeBase[]> {
    const knowledgeBases = await this.knowledgeBaseModelRepository.find({
      order: { projectName: 'ASC', projectId: 'ASC' },
    })

    return knowledgeBases.map((knowledgeBase) => KnowledgeBaseFactory.toKnowledgeBase(knowledgeBase))
  }
}
