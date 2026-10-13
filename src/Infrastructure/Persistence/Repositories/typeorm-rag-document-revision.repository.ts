import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
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
}
