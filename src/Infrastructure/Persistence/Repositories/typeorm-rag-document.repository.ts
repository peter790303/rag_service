import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
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
    const insert = this.documents
      .createQueryBuilder()
      .insert()
      .into(RagDocumentModel)
      .values({ sourceType, sourceKey, sourcePath, ...(currentTitle === undefined ? {} : { currentTitle }) })

    if (currentTitle === undefined) {
      await insert.orIgnore().execute()
    } else {
      await insert.orUpdate(['current_title'], ['source_type', 'source_key', 'source_path']).execute()
    }

    return this.documents.findOneByOrFail({ sourceType, sourceKey, sourcePath })
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
}
