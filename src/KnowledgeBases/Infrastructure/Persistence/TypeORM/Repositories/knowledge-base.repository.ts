import { Injectable } from '@nestjs/common'
import type { Repository } from 'typeorm'

import { PersistenceTransaction } from '../../../../../Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import { KnowledgeBaseRepository as KnowledgeBaseRepositoryContract } from '../../../../Application/Ports/Out/Repositories/knowledge-base.repository.ts'
import type {
  CreateKnowledgeBaseQO,
  KnowledgeBaseIdQO,
  KnowledgeBaseProjectQO,
  KnowledgeBaseProjectScopeQO,
  UpdateKnowledgeBaseQO,
} from '../../../../Application/QueryObjects/knowledge-base.query-object.ts'
import type { KnowledgeBase } from '../../../../Domain/Entities/knowledge-base.ts'
import { KnowledgeBasePersistenceAdapter } from '../Adapters/knowledge-base.persistence.adapter.ts'
import { KnowledgeBaseModel } from '../Models/knowledge-base.model.ts'

@Injectable()
export class KnowledgeBaseRepository extends KnowledgeBaseRepositoryContract {
  constructor(private readonly persistenceTransaction: PersistenceTransaction) {
    super()
  }

  private get knowledgeBaseModelRepository(): Repository<KnowledgeBaseModel> {
    return this.persistenceTransaction.manager.getRepository(KnowledgeBaseModel)
  }

  async lockByKnowledgeBaseId(knowledgeBaseIdQO: KnowledgeBaseIdQO): Promise<KnowledgeBase | null> {
    const knowledgeBase = await this.knowledgeBaseModelRepository.findOne({
      where: { id: knowledgeBaseIdQO.knowledgeBaseId },
      lock: { mode: 'pessimistic_write' },
    })

    return knowledgeBase ? KnowledgeBasePersistenceAdapter.toKnowledgeBase(knowledgeBase) : null
  }

  async create(createKnowledgeBaseQO: CreateKnowledgeBaseQO): Promise<void> {
    await this.knowledgeBaseModelRepository.insert({
      id: createKnowledgeBaseQO.knowledgeBaseId,
      projectId: createKnowledgeBaseQO.projectId,
      projectName: createKnowledgeBaseQO.projectName,
      createdAt: createKnowledgeBaseQO.createdAt,
      updatedAt: createKnowledgeBaseQO.updatedAt,
    })
  }

  async createIfAbsent(createKnowledgeBaseQO: CreateKnowledgeBaseQO): Promise<boolean> {
    const insertResult = await this.knowledgeBaseModelRepository
      .createQueryBuilder()
      .insert()
      .into(KnowledgeBaseModel)
      .values({
        id: createKnowledgeBaseQO.knowledgeBaseId,
        projectId: createKnowledgeBaseQO.projectId,
        projectName: createKnowledgeBaseQO.projectName,
        createdAt: createKnowledgeBaseQO.createdAt,
        updatedAt: createKnowledgeBaseQO.updatedAt,
      })
      .orIgnore()
      .returning('id')
      .execute()

    return insertResult.raw.length > 0
  }

  async update(updateKnowledgeBaseQO: UpdateKnowledgeBaseQO): Promise<void> {
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
    knowledgeBaseProjectScopeQO: KnowledgeBaseProjectScopeQO,
  ): Promise<KnowledgeBase | null> {
    const knowledgeBase = await this.knowledgeBaseModelRepository.findOneBy({
      id: knowledgeBaseProjectScopeQO.knowledgeBaseId,
      projectId: knowledgeBaseProjectScopeQO.projectId,
    })

    return knowledgeBase ? KnowledgeBasePersistenceAdapter.toKnowledgeBase(knowledgeBase) : null
  }

  async findByKnowledgeBaseId(knowledgeBaseIdQO: KnowledgeBaseIdQO): Promise<KnowledgeBase | null> {
    const knowledgeBase = await this.knowledgeBaseModelRepository.findOneBy({ id: knowledgeBaseIdQO.knowledgeBaseId })

    return knowledgeBase ? KnowledgeBasePersistenceAdapter.toKnowledgeBase(knowledgeBase) : null
  }

  async findByProjectId(knowledgeBaseProjectQO: KnowledgeBaseProjectQO): Promise<KnowledgeBase | null> {
    const knowledgeBase = await this.knowledgeBaseModelRepository.findOneBy({
      projectId: knowledgeBaseProjectQO.projectId,
    })

    return knowledgeBase ? KnowledgeBasePersistenceAdapter.toKnowledgeBase(knowledgeBase) : null
  }

  async list(): Promise<readonly KnowledgeBase[]> {
    const knowledgeBases = await this.knowledgeBaseModelRepository.find({
      order: { projectName: 'ASC', projectId: 'ASC' },
    })

    return knowledgeBases.map((knowledgeBase) => KnowledgeBasePersistenceAdapter.toKnowledgeBase(knowledgeBase))
  }
}
