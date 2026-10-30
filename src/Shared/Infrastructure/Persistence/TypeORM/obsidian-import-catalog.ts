import type { EntityManager } from 'typeorm'

import type { ImportManifestEntry } from './reset-rag-database.ts'
import { KnowledgeBaseDocumentModel } from '../../../../KnowledgeBases/Infrastructure/Persistence/TypeORM/Models/knowledge-base-document.model.ts'

export async function loadObsidianImportCatalog(manager: EntityManager): Promise<ImportManifestEntry[]> {
  const memberships = await manager.getRepository(KnowledgeBaseDocumentModel).find({
    relations: { knowledgeBase: true, document: true },
    where: { document: { sourceType: 'obsidian' } },
    order: { knowledgeBase: { projectId: 'ASC' }, document: { sourcePath: 'ASC' } },
  })

  return memberships.map(({ knowledgeBase, document, isEntry, alwaysIncludeFullContent }) => ({
    projectId: knowledgeBase.projectId,
    projectName: knowledgeBase.projectName,
    knowledgeBaseId: knowledgeBase.id,
    sourceType: document.sourceType,
    sourceKey: document.sourceKey,
    sourcePath: document.sourcePath,
    title: document.currentTitle,
    isEntry,
    alwaysIncludeFullContent,
  }))
}
