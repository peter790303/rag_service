import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, LessThanOrEqual } from 'typeorm'
import type { EntityManager, Repository } from 'typeorm'

import { RagDocumentRevisionModel } from '../Models/rag-document-revision.model.js'

/** Revision-primary persistence operations. */
@Injectable()
export class TypeOrmRagDocumentRevisionRepository {
  constructor(
    @InjectRepository(RagDocumentRevisionModel)
    private readonly revisions: Repository<RagDocumentRevisionModel>,
  ) {}

  async findOrCreate(
    manager: EntityManager,
    documentId: string,
    contentSha256: string,
    title: string | null,
    content: string,
  ): Promise<RagDocumentRevisionModel> {
    const revisionRepository = manager.getRepository(RagDocumentRevisionModel)
    const existingRevision = await revisionRepository.findOneBy({ documentId, contentSha256 })

    if (existingRevision) return existingRevision

    return revisionRepository.save(revisionRepository.create({ documentId, contentSha256, title, content }))
  }

  async findLatestForDocument(manager: EntityManager, documentId: string): Promise<RagDocumentRevisionModel | null> {
    return manager.getRepository(RagDocumentRevisionModel).findOne({
      where: { documentId },
      order: { createdAt: 'DESC' },
    })
  }

  async findByIdForDocument(
    manager: EntityManager,
    documentId: string,
    revisionId: string,
  ): Promise<RagDocumentRevisionModel | null> {
    return manager.getRepository(RagDocumentRevisionModel).findOneBy({ id: revisionId, documentId })
  }

  async findGarbageCandidatesIn(manager: EntityManager, cutoff: Date): Promise<RagDocumentRevisionModel[]> {
    return manager.getRepository(RagDocumentRevisionModel).findBy({ createdAt: LessThanOrEqual(cutoff) })
  }

  async lockByIdIn(manager: EntityManager, revisionId: string): Promise<RagDocumentRevisionModel | null> {
    return manager.getRepository(RagDocumentRevisionModel).findOne({
      where: { id: revisionId },
      lock: { mode: 'pessimistic_write' },
    })
  }

  async countForDocumentIn(manager: EntityManager, documentId: string): Promise<number> {
    return manager.getRepository(RagDocumentRevisionModel).countBy({ documentId })
  }

  async deleteByIdIn(manager: EntityManager, revisionId: string): Promise<void> {
    await manager.getRepository(RagDocumentRevisionModel).delete({ id: revisionId })
  }

  async findByIdsIn(manager: EntityManager, ids: string[]): Promise<RagDocumentRevisionModel[]> {
    if (!ids.length) return []

    return manager.getRepository(RagDocumentRevisionModel).findBy({ id: In(ids) })
  }
}
