import { Injectable } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { IsNull } from 'typeorm'

import { PersistenceTransaction } from '../../../../../Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import { KnowledgeBaseDocumentRepository as KnowledgeBaseDocumentRepositoryContract } from '../../../../Application/Ports/Out/Repositories/knowledge-base-document.repository.ts'
import type {
  InsertKnowledgeBaseDocumentQO,
  KnowledgeBaseDocumentActivationQO,
  KnowledgeBaseDocumentActiveIndexQO,
  KnowledgeBaseDocumentDocumentQO,
  KnowledgeBaseDocumentKnowledgeBaseQO,
  KnowledgeBaseDocumentSourceQO,
  UpdateKnowledgeBaseDocumentRequestQO,
  UpdateKnowledgeBaseDocumentQO,
  UpdateKnowledgeBaseDocumentActiveIndexQO,
} from '../../../../Application/QueryObjects/knowledge-base-document.query-object.ts'
import type { KnowledgeBaseDocument } from '../../../../Domain/Entities/knowledge-base-document.ts'
import { KnowledgeBaseDocumentPersistenceAdapter } from '../Adapters/knowledge-base-document.persistence.adapter.ts'
import { KnowledgeBaseDocumentModel } from '../Models/knowledge-base-document.model.ts'

@Injectable()
export class KnowledgeBaseDocumentRepository extends KnowledgeBaseDocumentRepositoryContract {
  constructor(private readonly persistenceTransaction: PersistenceTransaction) {
    super()
  }

  private get knowledgeBaseDocumentModelRepository(): Repository<KnowledgeBaseDocumentModel> {
    return this.persistenceTransaction.manager.getRepository(KnowledgeBaseDocumentModel)
  }

  async findByKnowledgeBaseIdAndDocumentId(
    knowledgeBaseDocumentSourceQO: KnowledgeBaseDocumentSourceQO,
  ): Promise<KnowledgeBaseDocument | null> {
    const persistedKnowledgeBaseDocument = await this.knowledgeBaseDocumentModelRepository.findOneBy({
      knowledgeBaseId: knowledgeBaseDocumentSourceQO.knowledgeBaseId,
      documentId: knowledgeBaseDocumentSourceQO.documentId,
    })

    return persistedKnowledgeBaseDocument === null
      ? null
      : KnowledgeBaseDocumentPersistenceAdapter.toKnowledgeBaseDocument(persistedKnowledgeBaseDocument)
  }

  async lockByKnowledgeBaseIdAndDocumentId(
    knowledgeBaseDocumentSourceQO: KnowledgeBaseDocumentSourceQO,
  ): Promise<KnowledgeBaseDocument | null> {
    const persistedKnowledgeBaseDocument = await this.knowledgeBaseDocumentModelRepository.findOne({
      where: {
        knowledgeBaseId: knowledgeBaseDocumentSourceQO.knowledgeBaseId,
        documentId: knowledgeBaseDocumentSourceQO.documentId,
      },
      lock: { mode: 'pessimistic_write' },
    })

    return persistedKnowledgeBaseDocument === null
      ? null
      : KnowledgeBaseDocumentPersistenceAdapter.toKnowledgeBaseDocument(persistedKnowledgeBaseDocument)
  }

  async lockByKnowledgeBaseIdAndDocumentIdSkipLocked(
    knowledgeBaseDocumentSourceQO: KnowledgeBaseDocumentSourceQO,
  ): Promise<KnowledgeBaseDocument | null> {
    const persistedKnowledgeBaseDocument = await this.knowledgeBaseDocumentModelRepository.findOne({
      where: {
        knowledgeBaseId: knowledgeBaseDocumentSourceQO.knowledgeBaseId,
        documentId: knowledgeBaseDocumentSourceQO.documentId,
      },
      lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
    })

    return persistedKnowledgeBaseDocument === null
      ? null
      : KnowledgeBaseDocumentPersistenceAdapter.toKnowledgeBaseDocument(persistedKnowledgeBaseDocument)
  }

  async insert(insertKnowledgeBaseDocumentQO: InsertKnowledgeBaseDocumentQO): Promise<void> {
    await this.knowledgeBaseDocumentModelRepository.insert({
      knowledgeBaseId: insertKnowledgeBaseDocumentQO.knowledgeBaseId,
      documentId: insertKnowledgeBaseDocumentQO.documentId,
      isEntry: insertKnowledgeBaseDocumentQO.isEntry,
      alwaysIncludeFullContent: insertKnowledgeBaseDocumentQO.alwaysIncludeFullContent,
      activeDocumentIndexId: insertKnowledgeBaseDocumentQO.activeDocumentIndexId,
      requestedGeneration: insertKnowledgeBaseDocumentQO.requestedGeneration,
      updatedAt: insertKnowledgeBaseDocumentQO.updatedAt,
    })
  }

  async updateByKnowledgeBaseIdAndDocumentId(
    updateKnowledgeBaseDocumentQO: UpdateKnowledgeBaseDocumentQO,
  ): Promise<void> {
    await this.knowledgeBaseDocumentModelRepository.update(
      {
        knowledgeBaseId: updateKnowledgeBaseDocumentQO.knowledgeBaseId,
        documentId: updateKnowledgeBaseDocumentQO.documentId,
      },
      {
        isEntry: updateKnowledgeBaseDocumentQO.isEntry,
        alwaysIncludeFullContent: updateKnowledgeBaseDocumentQO.alwaysIncludeFullContent,
        activeDocumentIndexId: updateKnowledgeBaseDocumentQO.activeDocumentIndexId,
        requestedGeneration: updateKnowledgeBaseDocumentQO.requestedGeneration,
        updatedAt: updateKnowledgeBaseDocumentQO.updatedAt,
      },
    )
  }

  async updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentId(
    updateKnowledgeBaseDocumentActiveIndexQO: UpdateKnowledgeBaseDocumentActiveIndexQO,
  ): Promise<void> {
    await this.knowledgeBaseDocumentModelRepository.update(
      {
        knowledgeBaseId: updateKnowledgeBaseDocumentActiveIndexQO.knowledgeBaseId,
        documentId: updateKnowledgeBaseDocumentActiveIndexQO.documentId,
      },
      {
        activeDocumentIndexId: updateKnowledgeBaseDocumentActiveIndexQO.activeDocumentIndexId,
        updatedAt: updateKnowledgeBaseDocumentActiveIndexQO.updatedAt,
      },
    )
  }

  async removeByKnowledgeBaseIdAndDocumentId(
    knowledgeBaseDocumentSourceQO: KnowledgeBaseDocumentSourceQO,
  ): Promise<void> {
    await this.knowledgeBaseDocumentModelRepository.delete({
      knowledgeBaseId: knowledgeBaseDocumentSourceQO.knowledgeBaseId,
      documentId: knowledgeBaseDocumentSourceQO.documentId,
    })
  }

  async updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId(
    knowledgeBaseDocumentActivationQO: KnowledgeBaseDocumentActivationQO,
  ): Promise<KnowledgeBaseDocument | null> {
    const knowledgeBaseDocumentActivationUpdate = await this.knowledgeBaseDocumentModelRepository.update(
      {
        knowledgeBaseId: knowledgeBaseDocumentActivationQO.knowledgeBaseId,
        documentId: knowledgeBaseDocumentActivationQO.documentId,
        requestedGeneration: knowledgeBaseDocumentActivationQO.requestedGeneration,
        activeDocumentIndexId:
          knowledgeBaseDocumentActivationQO.expectedActiveDocumentIndexId === null
            ? IsNull()
            : knowledgeBaseDocumentActivationQO.expectedActiveDocumentIndexId,
      },
      {
        activeDocumentIndexId: knowledgeBaseDocumentActivationQO.documentIndexId,
        updatedAt: knowledgeBaseDocumentActivationQO.updatedAt,
      },
    )

    if ((knowledgeBaseDocumentActivationUpdate.affected ?? 0) !== 1) return null

    return this.findByKnowledgeBaseIdAndDocumentId(knowledgeBaseDocumentActivationQO)
  }

  async updateRequest(updateKnowledgeBaseDocumentRequestQO: UpdateKnowledgeBaseDocumentRequestQO): Promise<void> {
    const { knowledgeBaseId, documentId, ...requestFields } = updateKnowledgeBaseDocumentRequestQO
    await this.knowledgeBaseDocumentModelRepository.update({ knowledgeBaseId, documentId }, requestFields)
  }

  async findByActiveDocumentIndexId(
    knowledgeBaseDocumentActiveIndexQO: KnowledgeBaseDocumentActiveIndexQO,
  ): Promise<KnowledgeBaseDocument | null> {
    const persistedKnowledgeBaseDocument = await this.knowledgeBaseDocumentModelRepository.findOneBy({
      activeDocumentIndexId: knowledgeBaseDocumentActiveIndexQO.documentIndexId,
    })

    return persistedKnowledgeBaseDocument === null
      ? null
      : KnowledgeBaseDocumentPersistenceAdapter.toKnowledgeBaseDocument(persistedKnowledgeBaseDocument)
  }

  async findByKnowledgeBaseIdOrderByDocumentIdAsc(
    knowledgeBaseDocumentKnowledgeBaseQO: KnowledgeBaseDocumentKnowledgeBaseQO,
  ): Promise<KnowledgeBaseDocument[]> {
    const persistedKnowledgeBaseDocuments = await this.knowledgeBaseDocumentModelRepository.find({
      where: { knowledgeBaseId: knowledgeBaseDocumentKnowledgeBaseQO.knowledgeBaseId },
      order: { documentId: 'ASC' },
    })

    return persistedKnowledgeBaseDocuments.map(KnowledgeBaseDocumentPersistenceAdapter.toKnowledgeBaseDocument)
  }

  async findByDocumentId(
    knowledgeBaseDocumentDocumentQO: KnowledgeBaseDocumentDocumentQO,
  ): Promise<KnowledgeBaseDocument | null> {
    const persistedKnowledgeBaseDocument = await this.knowledgeBaseDocumentModelRepository.findOneBy({
      documentId: knowledgeBaseDocumentDocumentQO.documentId,
    })

    return persistedKnowledgeBaseDocument === null
      ? null
      : KnowledgeBaseDocumentPersistenceAdapter.toKnowledgeBaseDocument(persistedKnowledgeBaseDocument)
  }
}
