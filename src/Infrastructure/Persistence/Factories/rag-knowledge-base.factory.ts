import { RagKnowledgeBase } from '../../../Domain/Knowledge/rag-knowledge-base.js'
import { RagKnowledgeBaseModel } from '../Models/rag-knowledge-base.model.js'

export class RagKnowledgeBaseFactory {
  static toDomain(model: RagKnowledgeBaseModel): RagKnowledgeBase {
    return RagKnowledgeBase.create({
      id: model.id,
      projectId: model.projectId,
      projectName: model.projectName,
    })
  }

  static toPersistence(knowledgeBase: RagKnowledgeBase): RagKnowledgeBaseModel {
    const model = new RagKnowledgeBaseModel()
    model.id = knowledgeBase.id
    model.projectId = knowledgeBase.projectId
    model.projectName = knowledgeBase.projectName

    return model
  }
}
