import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'
import type {
  CreateKnowledgeBaseQueryObject,
  KnowledgeBaseIdQueryObject,
  KnowledgeBaseProjectQueryObject,
  KnowledgeBaseProjectScopeQueryObject,
  UpdateKnowledgeBaseQueryObject,
} from '../QueryObjects/knowledge-base.query-object.ts'

export abstract class KnowledgeBaseRepository {
  abstract lockByKnowledgeBaseId(knowledgeBaseIdQO: KnowledgeBaseIdQueryObject): Promise<KnowledgeBase | null>

  abstract create(createKnowledgeBaseQO: CreateKnowledgeBaseQueryObject): Promise<void>

  abstract update(updateKnowledgeBaseQO: UpdateKnowledgeBaseQueryObject): Promise<void>

  abstract findByKnowledgeBaseIdAndProjectId(
    knowledgeBaseProjectScopeQO: KnowledgeBaseProjectScopeQueryObject,
  ): Promise<KnowledgeBase | null>

  abstract findByKnowledgeBaseId(knowledgeBaseIdQO: KnowledgeBaseIdQueryObject): Promise<KnowledgeBase | null>

  abstract findByProjectId(knowledgeBaseProjectQO: KnowledgeBaseProjectQueryObject): Promise<KnowledgeBase | null>

  abstract list(): Promise<readonly KnowledgeBase[]>
}
