import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'

import { KnowledgeBaseProjectMismatchException } from '../../../Domain/Knowledge/Exceptions/knowledge-base-project-mismatch.exception.js'
import { RagKnowledgeBaseModel } from '../Models/rag-knowledge-base.model.js'

@Injectable()
export class TypeOrmRagKnowledgeBaseRepository {
  constructor(
    @InjectRepository(RagKnowledgeBaseModel)
    private readonly knowledgeBases: Repository<RagKnowledgeBaseModel>,
  ) {}

  async ensureProject(knowledgeBaseId: string, projectId: string, projectName: string): Promise<RagKnowledgeBaseModel> {
    const knowledgeBase = await this.knowledgeBases.findOneBy({ id: knowledgeBaseId })

    if (!knowledgeBase)
      return this.knowledgeBases.save(this.knowledgeBases.create({ id: knowledgeBaseId, projectId, projectName }))

    if (knowledgeBase.projectId !== projectId) throw new KnowledgeBaseProjectMismatchException()

    if (knowledgeBase.projectName === projectName) return knowledgeBase

    knowledgeBase.projectName = projectName

    return this.knowledgeBases.save(knowledgeBase)
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
}
