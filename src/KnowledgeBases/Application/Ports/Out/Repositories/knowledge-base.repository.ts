import type { KnowledgeBase } from '../../../../Domain/Entities/knowledge-base.ts'
import type {
  CreateKnowledgeBaseQO,
  KnowledgeBaseIdQO,
  KnowledgeBaseProjectQO,
  KnowledgeBaseProjectScopeQO,
  UpdateKnowledgeBaseQO,
} from '../../../QueryObjects/knowledge-base.query-object.ts'

export abstract class KnowledgeBaseRepository {
  abstract lockByKnowledgeBaseId(knowledgeBaseIdQO: KnowledgeBaseIdQO): Promise<KnowledgeBase | null>

  abstract create(createKnowledgeBaseQO: CreateKnowledgeBaseQO): Promise<void>

  abstract createIfAbsent(createKnowledgeBaseQO: CreateKnowledgeBaseQO): Promise<boolean>

  abstract update(updateKnowledgeBaseQO: UpdateKnowledgeBaseQO): Promise<void>

  abstract findByKnowledgeBaseIdAndProjectId(
    knowledgeBaseProjectScopeQO: KnowledgeBaseProjectScopeQO,
  ): Promise<KnowledgeBase | null>

  abstract findByKnowledgeBaseId(knowledgeBaseIdQO: KnowledgeBaseIdQO): Promise<KnowledgeBase | null>

  abstract findByProjectId(knowledgeBaseProjectQO: KnowledgeBaseProjectQO): Promise<KnowledgeBase | null>

  abstract list(): Promise<readonly KnowledgeBase[]>
}
