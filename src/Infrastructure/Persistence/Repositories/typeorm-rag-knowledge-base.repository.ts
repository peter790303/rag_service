import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'

import type { RagKnowledgeBase } from '../../../Domain/Knowledge/rag-knowledge-base.js'
import { RagKnowledgeBaseFactory } from '../Factories/rag-knowledge-base.factory.js'
import { RagKnowledgeBaseModel } from '../Models/rag-knowledge-base.model.js'

@Injectable()
export class TypeOrmRagKnowledgeBaseRepository {
  constructor(
    @InjectRepository(RagKnowledgeBaseModel)
    private readonly knowledgeBases: Repository<RagKnowledgeBaseModel>,
  ) {}

  async lockByIdIn(manager: EntityManager, knowledgeBaseId: string): Promise<RagKnowledgeBase | null> {
    const repository = manager.getRepository(RagKnowledgeBaseModel)
    const knowledgeBase = await repository.findOne({
      where: { id: knowledgeBaseId },
      lock: { mode: 'pessimistic_write' },
    })

    return knowledgeBase ? RagKnowledgeBaseFactory.toDomain(knowledgeBase) : null
  }

  async createIn(manager: EntityManager, knowledgeBase: RagKnowledgeBase): Promise<void> {
    await manager.getRepository(RagKnowledgeBaseModel).insert(RagKnowledgeBaseFactory.toPersistence(knowledgeBase))
  }

  async saveIn(manager: EntityManager, knowledgeBase: RagKnowledgeBase): Promise<void> {
    await manager.getRepository(RagKnowledgeBaseModel).save(RagKnowledgeBaseFactory.toPersistence(knowledgeBase))
  }

  async belongsToProject(manager: EntityManager, knowledgeBaseId: string, projectId: string): Promise<boolean> {
    const knowledgeBase = await manager.getRepository(RagKnowledgeBaseModel).findOneBy({
      id: knowledgeBaseId,
      projectId,
    })

    return knowledgeBase !== null
  }

  async findByIdIn(manager: EntityManager, id: string): Promise<RagKnowledgeBaseModel | null> {
    return manager.getRepository(RagKnowledgeBaseModel).findOneBy({ id })
  }

  async findByProjectIdIn(manager: EntityManager, projectId: string): Promise<RagKnowledgeBaseModel | null> {
    return manager.getRepository(RagKnowledgeBaseModel).findOneBy({ projectId })
  }
}
