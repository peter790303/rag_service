import type { QueryRunner } from 'typeorm'

import { ChunkModel } from './Models/chunk.model.ts'
import { DocumentIndexSuccessReceiptModel } from './Models/document-index-success-receipt.model.ts'
import { DocumentIndexModel } from './Models/document-index.model.ts'
import { DocumentRelationModel } from './Models/document-relation.model.ts'
import { DocumentRevisionModel } from './Models/document-revision.model.ts'
import { DocumentModel } from './Models/document.model.ts'
import { FailedJobModel } from './Models/failed-job.model.ts'
import { JobModel } from './Models/job.model.ts'
import { KnowledgeBaseDocumentModel } from './Models/knowledge-base-document.model.ts'
import { KnowledgeBaseModel } from './Models/knowledge-base.model.ts'
import { loadObsidianImportCatalog } from './obsidian-import-catalog.ts'

export type ImportManifestEntry = {
  projectId: string
  projectName: string
  knowledgeBaseId: string
  sourceType: string
  sourceKey: string
  sourcePath: string
  title: string | null
  isEntry: boolean
  alwaysIncludeFullContent: boolean
}

export type ImportManifestWriter = (entries: ImportManifestEntry[]) => Promise<void>

const deleteAll = async (queryRunner: QueryRunner): Promise<void> => {
  await queryRunner.manager.getRepository(DocumentIndexSuccessReceiptModel).createQueryBuilder().delete().execute()
  await queryRunner.manager.getRepository(JobModel).createQueryBuilder().delete().execute()
  await queryRunner.manager.getRepository(FailedJobModel).createQueryBuilder().delete().execute()
  await queryRunner.manager.getRepository(DocumentRelationModel).createQueryBuilder().delete().execute()
  await queryRunner.manager.getRepository(ChunkModel).createQueryBuilder().delete().execute()
  await queryRunner.manager.getRepository(KnowledgeBaseDocumentModel).createQueryBuilder().delete().execute()
  await queryRunner.manager.getRepository(DocumentIndexModel).createQueryBuilder().delete().execute()
  await queryRunner.manager.getRepository(DocumentRevisionModel).createQueryBuilder().delete().execute()
  await queryRunner.manager.getRepository(DocumentModel).createQueryBuilder().delete().execute()
  await queryRunner.manager.getRepository(KnowledgeBaseModel).createQueryBuilder().delete().execute()
}

export async function resetRagDatabase(queryRunner: QueryRunner, writeManifest: ImportManifestWriter): Promise<number> {
  if (queryRunner.connection.options.type !== 'postgres') {
    throw new Error('RAG database reset requires PostgreSQL')
  }

  await queryRunner.startTransaction('SERIALIZABLE')
  try {
    const runningJobs = await queryRunner.manager.getRepository(JobModel).count({ where: { status: 'running' } })

    if (runningJobs > 0) {
      throw new Error('RAG database reset refused while indexing jobs are running')
    }

    const entries = await loadObsidianImportCatalog(queryRunner.manager)

    if (entries.length > 0) await writeManifest(entries)

    await deleteAll(queryRunner)
    await queryRunner.commitTransaction()

    return entries.length
  } catch (error) {
    await queryRunner.rollbackTransaction()
    throw error
  }
}
