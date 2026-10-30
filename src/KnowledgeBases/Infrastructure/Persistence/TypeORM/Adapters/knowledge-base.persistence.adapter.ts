import { KnowledgeBase } from '../../../../Domain/Entities/knowledge-base.ts'
import { KnowledgeBaseModel } from '../Models/knowledge-base.model.ts'

export class KnowledgeBasePersistenceAdapter {
  static toKnowledgeBase(knowledgeBaseModel: KnowledgeBaseModel): KnowledgeBase {
    return KnowledgeBase.create({
      id: knowledgeBaseModel.id,
      projectId: knowledgeBaseModel.projectId,
      projectName: knowledgeBaseModel.projectName,
      createdAt: knowledgeBaseModel.createdAt,
      updatedAt: knowledgeBaseModel.updatedAt,
    })
  }

  static toKnowledgeBaseModel(knowledgeBase: KnowledgeBase): KnowledgeBaseModel {
    const knowledgeBaseModel = new KnowledgeBaseModel()
    knowledgeBaseModel.id = knowledgeBase.id
    knowledgeBaseModel.projectId = knowledgeBase.projectId
    knowledgeBaseModel.projectName = knowledgeBase.projectName
    knowledgeBaseModel.createdAt = knowledgeBase.createdAt
    knowledgeBaseModel.updatedAt = knowledgeBase.updatedAt

    return knowledgeBaseModel
  }
}
