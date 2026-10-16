import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'
import type { KnowledgeBaseIdQueryObject } from '../QueryObjects/knowledge-base.query-object.ts'
import type { KnowledgeBaseProjectQueryObject } from '../QueryObjects/knowledge-base.query-object.ts'
import type { KnowledgeBaseProjectScopeQueryObject } from '../QueryObjects/knowledge-base.query-object.ts'
import type {
  CreateKnowledgeBaseQueryObject,
  SaveKnowledgeBaseQueryObject,
} from '../QueryObjects/knowledge-base.query-object.ts'

export abstract class KnowledgeBaseRepository {
  abstract lockByKnowledgeBaseId(knowledgeBaseIdQO: KnowledgeBaseIdQueryObject): Promise<KnowledgeBase | null>

  abstract create(createKnowledgeBaseQO: CreateKnowledgeBaseQueryObject): Promise<void>

  abstract save(saveKnowledgeBaseQO: SaveKnowledgeBaseQueryObject): Promise<void>

  abstract findByKnowledgeBaseIdAndProjectId(
    knowledgeBaseProjectScopeQO: KnowledgeBaseProjectScopeQueryObject,
  ): Promise<KnowledgeBase | null>

  abstract findByKnowledgeBaseId(knowledgeBaseIdQO: KnowledgeBaseIdQueryObject): Promise<KnowledgeBase | null>

  abstract findByProjectId(knowledgeBaseProjectQO: KnowledgeBaseProjectQueryObject): Promise<KnowledgeBase | null>
}
