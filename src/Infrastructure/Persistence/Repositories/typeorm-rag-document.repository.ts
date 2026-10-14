import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, LessThanOrEqual } from 'typeorm'
import { Repository } from 'typeorm'
import { EntityManager } from 'typeorm'

import { RagDocumentModel } from '../Models/rag-document.model.js'

@Injectable()
export class TypeOrmRagDocumentRepository {
  constructor(@InjectRepository(RagDocumentModel) private readonly documents: Repository<RagDocumentModel>) {}

  async ensureSource(
    sourceType: string,
    sourceKey: string,
    sourcePath: string,
    currentTitle?: string | null,
  ): Promise<RagDocumentModel> {
    return this.ensureSourceInRepository(this.documents, sourceType, sourceKey, sourcePath, currentTitle)
  }

  async ensureSourceIn(
    manager: EntityManager,
    sourceType: string,
    sourceKey: string,
    sourcePath: string,
    currentTitle?: string | null,
  ): Promise<RagDocumentModel> {
    return this.ensureSourceInRepository(
      manager.getRepository(RagDocumentModel),
      sourceType,
      sourceKey,
      sourcePath,
      currentTitle,
    )
  }

  private async ensureSourceInRepository(
    documents: Repository<RagDocumentModel>,
    sourceType: string,
    sourceKey: string,
    sourcePath: string,
    currentTitle?: string | null,
  ): Promise<RagDocumentModel> {
    const insert = documents
      .createQueryBuilder()
      .insert()
      .into(RagDocumentModel)
      .values({
        sourceType,
        sourceKey,
        sourcePath,
        unreferencedSince: null,
        ...(currentTitle === undefined ? {} : { currentTitle }),
      })

    // Updating the identical source path on conflict acquires a row lock held
    // by the caller's transaction, so document GC cannot delete it before the
    // membership and revision references are attached.
    await insert
      .orUpdate(
        currentTitle === undefined
          ? ['source_path', 'unreferenced_since']
          : ['source_path', 'current_title', 'unreferenced_since'],
        ['source_type', 'source_key', 'source_path'],
      )
      .execute()

    return documents.findOneByOrFail({ sourceType, sourceKey, sourcePath })
  }

  async lockById(manager: EntityManager, documentId: string): Promise<RagDocumentModel | null> {
    return manager.getRepository(RagDocumentModel).findOne({
      where: { id: documentId },
      lock: { mode: 'pessimistic_write' },
    })
  }

  async findByIdIn(manager: EntityManager, documentId: string): Promise<RagDocumentModel | null> {
    return manager.getRepository(RagDocumentModel).findOneBy({ id: documentId })
  }

  async lockAvailableByIdIn(manager: EntityManager, documentId: string): Promise<RagDocumentModel | null> {
    return manager
      .getRepository(RagDocumentModel)
      .createQueryBuilder('document')
      .where('document.id = :documentId', { documentId })
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .getOne()
  }

  async findGarbageCandidatesIn(manager: EntityManager, cutoff: Date): Promise<RagDocumentModel[]> {
    return manager.getRepository(RagDocumentModel).findBy({ unreferencedSince: LessThanOrEqual(cutoff) })
  }

  async markUnreferencedIn(manager: EntityManager, documentId: string, unreferencedSince: Date): Promise<void> {
    await manager
      .getRepository(RagDocumentModel)
      .update({ id: documentId, unreferencedSince: IsNull() }, { unreferencedSince })
  }

  async deleteByIdIn(manager: EntityManager, documentId: string): Promise<void> {
    await manager.getRepository(RagDocumentModel).delete({ id: documentId })
  }

  async findByIdsIn(manager: EntityManager, ids: string[]): Promise<RagDocumentModel[]> {
    if (!ids.length) return []

    return manager.getRepository(RagDocumentModel).findBy({ id: In(ids) })
  }
}
