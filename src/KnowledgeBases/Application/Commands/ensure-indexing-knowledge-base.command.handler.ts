import type { EnsureIndexingKnowledgeBaseCommand } from './ensure-indexing-knowledge-base.command.ts'
import { KnowledgeBase } from '../../Domain/Entities/knowledge-base.ts'
import type { EnsureIndexingKnowledgeBaseCommandHandlerContract } from '../Contracts/ensure-indexing-knowledge-base.command.handler.contract.ts'
import { IndexingKnowledgeBaseInputGuard } from '../Guards/indexing-knowledge-base-input.guard.ts'
import type { KnowledgeBaseRepository } from '../Ports/Out/Repositories/knowledge-base.repository.ts'
import type {
  CreateKnowledgeBaseQO,
  KnowledgeBaseIdQO,
  UpdateKnowledgeBaseQO,
} from '../QueryObjects/knowledge-base.query-object.ts'

/** Verifies project ownership before preparing an indexing request's knowledge base. */
export class EnsureIndexingKnowledgeBaseCommandHandler implements EnsureIndexingKnowledgeBaseCommandHandlerContract {
  constructor(private readonly knowledgeBases: KnowledgeBaseRepository) {}

  async execute(ensureIndexingKnowledgeBaseCommand: EnsureIndexingKnowledgeBaseCommand): Promise<void> {
    IndexingKnowledgeBaseInputGuard.assertValid(
      ensureIndexingKnowledgeBaseCommand.knowledgeBaseId,
      ensureIndexingKnowledgeBaseCommand.projectId,
      ensureIndexingKnowledgeBaseCommand.projectName,
    )

    const knowledgeBaseIdQO: KnowledgeBaseIdQO = {
      knowledgeBaseId: ensureIndexingKnowledgeBaseCommand.knowledgeBaseId,
    }
    let knowledgeBase = await this.knowledgeBases.lockByKnowledgeBaseId(knowledgeBaseIdQO)

    if (knowledgeBase === null) {
      const now = new Date()
      const newKnowledgeBase = KnowledgeBase.create({
        id: ensureIndexingKnowledgeBaseCommand.knowledgeBaseId,
        projectId: ensureIndexingKnowledgeBaseCommand.projectId,
        projectName: ensureIndexingKnowledgeBaseCommand.projectName,
        createdAt: now,
        updatedAt: now,
      })
      const createKnowledgeBaseQO: CreateKnowledgeBaseQO = {
        knowledgeBaseId: newKnowledgeBase.id,
        projectId: newKnowledgeBase.projectId,
        projectName: newKnowledgeBase.projectName,
        createdAt: newKnowledgeBase.createdAt,
        updatedAt: newKnowledgeBase.updatedAt,
      }
      const wasCreated = await this.knowledgeBases.createIfAbsent(createKnowledgeBaseQO)

      if (wasCreated) return

      knowledgeBase = await this.knowledgeBases.lockByKnowledgeBaseId(knowledgeBaseIdQO)

      if (knowledgeBase === null) throw new Error('Knowledge base disappeared after a concurrent create')
    }

    knowledgeBase.assertProject(ensureIndexingKnowledgeBaseCommand.projectId)

    if (knowledgeBase.projectName === ensureIndexingKnowledgeBaseCommand.projectName) return

    knowledgeBase.synchronizeProjectName(ensureIndexingKnowledgeBaseCommand.projectName, new Date())
    const updateKnowledgeBaseQO: UpdateKnowledgeBaseQO = {
      knowledgeBaseId: knowledgeBase.id,
      projectId: knowledgeBase.projectId,
      projectName: knowledgeBase.projectName,
      updatedAt: knowledgeBase.updatedAt,
    }
    await this.knowledgeBases.update(updateKnowledgeBaseQO)
  }
}
