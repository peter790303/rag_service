import { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'
import type { EnsureIndexingKnowledgeBaseUseCaseContract } from '../Contracts/ensure-indexing-knowledge-base.use-case.contract.ts'
import type { KnowledgeBaseRepository } from '../Contracts/knowledge-base.repository.ts'
import { IndexingKnowledgeBaseInputGuard } from '../Guards/indexing-knowledge-base-input.guard.ts'

/** Verifies project ownership before preparing an indexing request's knowledge base. */
export class EnsureIndexingKnowledgeBaseUseCase implements EnsureIndexingKnowledgeBaseUseCaseContract {
  constructor(private readonly knowledgeBases: KnowledgeBaseRepository) {}

  async execute(ensureIndexingKnowledgeBaseDTO: {
    knowledgeBaseId: string
    projectId: string
    projectName: string
  }): Promise<void> {
    IndexingKnowledgeBaseInputGuard.assertValid(
      ensureIndexingKnowledgeBaseDTO.knowledgeBaseId,
      ensureIndexingKnowledgeBaseDTO.projectId,
      ensureIndexingKnowledgeBaseDTO.projectName,
    )

    const knowledgeBaseIdQO = { knowledgeBaseId: ensureIndexingKnowledgeBaseDTO.knowledgeBaseId }
    const knowledgeBase = await this.knowledgeBases.lockByKnowledgeBaseId(knowledgeBaseIdQO)

    if (knowledgeBase === null) {
      const now = new Date()
      const newKnowledgeBase = KnowledgeBase.create({
        id: ensureIndexingKnowledgeBaseDTO.knowledgeBaseId,
        projectId: ensureIndexingKnowledgeBaseDTO.projectId,
        projectName: ensureIndexingKnowledgeBaseDTO.projectName,
        createdAt: now,
        updatedAt: now,
      })
      const createKnowledgeBaseQO = {
        knowledgeBaseId: newKnowledgeBase.id,
        projectId: newKnowledgeBase.projectId,
        projectName: newKnowledgeBase.projectName,
        createdAt: newKnowledgeBase.createdAt,
        updatedAt: newKnowledgeBase.updatedAt,
      }
      await this.knowledgeBases.create(createKnowledgeBaseQO)

      return
    }

    knowledgeBase.assertProject(ensureIndexingKnowledgeBaseDTO.projectId)

    if (knowledgeBase.projectName === ensureIndexingKnowledgeBaseDTO.projectName) return

    knowledgeBase.synchronizeProjectName(ensureIndexingKnowledgeBaseDTO.projectName, new Date())
    const saveKnowledgeBaseQO = {
      knowledgeBaseId: knowledgeBase.id,
      projectId: knowledgeBase.projectId,
      projectName: knowledgeBase.projectName,
      updatedAt: knowledgeBase.updatedAt,
    }
    await this.knowledgeBases.save(saveKnowledgeBaseQO)
  }
}
