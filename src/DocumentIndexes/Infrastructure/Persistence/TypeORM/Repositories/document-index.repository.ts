import { Injectable } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { In } from 'typeorm'
import { LessThanOrEqual } from 'typeorm'

import { PersistenceTransaction } from '../../../../../Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import { DocumentIndexRepository as DocumentIndexRepositoryContract } from '../../../../Application/Ports/Out/Repositories/document-index.repository.ts'
import type {
  CreateBuildingDocumentIndexQO,
  SaveDocumentIndexLifecycleQO,
  SetDocumentIndexUnreferencedSinceQO,
} from '../../../../Application/QueryObjects/document-index.query-object.ts'
import type {
  DocumentIndexDocumentQO,
  DocumentIndexDocumentsQO,
  DocumentIndexGarbageCandidatesQO,
  DocumentIndexIdQO,
  DocumentIndexRevisionPipelineQO,
  DocumentIndexRevisionQO,
} from '../../../../Application/QueryObjects/document-index.query-object.ts'
import type { DocumentIndex } from '../../../../Domain/Entities/document-index.ts'
import { DocumentIndexPersistenceAdapter } from '../Adapters/document-index.persistence.adapter.ts'
import { DocumentIndexModel } from '../Models/document-index.model.ts'

/** CRUD and queries for the document-index Model. */
@Injectable()
export class DocumentIndexRepository extends DocumentIndexRepositoryContract {
  constructor(private readonly persistenceTransaction: PersistenceTransaction) {
    super()
  }

  private get documentIndexModelRepository(): Repository<DocumentIndexModel> {
    return this.persistenceTransaction.manager.getRepository(DocumentIndexModel)
  }

  async findByDocumentRevisionIdAndPipelineHash(
    documentIndexRevisionPipelineQO: DocumentIndexRevisionPipelineQO,
  ): Promise<DocumentIndex | null> {
    const persistedDocumentIndex = await this.documentIndexModelRepository.findOneBy({
      revisionId: documentIndexRevisionPipelineQO.revisionId,
      pipelineHash: documentIndexRevisionPipelineQO.pipelineHash,
    })

    return persistedDocumentIndex === null
      ? null
      : DocumentIndexPersistenceAdapter.toDocumentIndex(persistedDocumentIndex)
  }

  async createBuildingIndex(createBuildingDocumentIndexQO: CreateBuildingDocumentIndexQO): Promise<void> {
    await this.documentIndexModelRepository.insert(createBuildingDocumentIndexQO)
  }

  async lockByDocumentIndexId(documentIndexIdQO: DocumentIndexIdQO): Promise<DocumentIndex | null> {
    const persistedDocumentIndex = await this.documentIndexModelRepository.findOne({
      where: { id: documentIndexIdQO.documentIndexId },
      lock: { mode: 'pessimistic_write' },
    })

    return persistedDocumentIndex === null
      ? null
      : DocumentIndexPersistenceAdapter.toDocumentIndex(persistedDocumentIndex)
  }

  async lockByDocumentIndexIdSkipLocked(documentIndexIdQO: DocumentIndexIdQO): Promise<DocumentIndex | null> {
    const persistedDocumentIndex = await this.documentIndexModelRepository.findOne({
      where: { id: documentIndexIdQO.documentIndexId },
      lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
    })

    return persistedDocumentIndex === null
      ? null
      : DocumentIndexPersistenceAdapter.toDocumentIndex(persistedDocumentIndex)
  }

  async findByDocumentIndexId(documentIndexIdQO: DocumentIndexIdQO): Promise<DocumentIndex | null> {
    const persistedDocumentIndex = await this.documentIndexModelRepository.findOneBy({
      id: documentIndexIdQO.documentIndexId,
    })

    return persistedDocumentIndex === null
      ? null
      : DocumentIndexPersistenceAdapter.toDocumentIndex(persistedDocumentIndex)
  }

  async updateByDocumentIndexIdWithLifecycleFields(
    saveDocumentIndexLifecycleQO: SaveDocumentIndexLifecycleQO,
  ): Promise<void> {
    const { documentIndexId, ...lifecycleFields } = saveDocumentIndexLifecycleQO
    await this.documentIndexModelRepository.update({ id: documentIndexId }, lifecycleFields)
  }

  async updateByDocumentIndexIdWithUnreferencedSince(
    setDocumentIndexUnreferencedSinceQO: SetDocumentIndexUnreferencedSinceQO,
  ): Promise<void> {
    await this.documentIndexModelRepository.update(
      { id: setDocumentIndexUnreferencedSinceQO.documentIndexId },
      { unreferencedSince: setDocumentIndexUnreferencedSinceQO.unreferencedSince },
    )
  }

  async findByDocumentId(documentIndexDocumentQO: DocumentIndexDocumentQO): Promise<DocumentIndex[]> {
    const persistedDocumentIndexes = await this.documentIndexModelRepository.findBy({
      documentId: documentIndexDocumentQO.documentId,
    })

    return persistedDocumentIndexes.map(DocumentIndexPersistenceAdapter.toDocumentIndex)
  }

  async findByRevisionId(documentIndexRevisionQO: DocumentIndexRevisionQO): Promise<DocumentIndex[]> {
    const persistedDocumentIndexes = await this.documentIndexModelRepository.findBy({
      revisionId: documentIndexRevisionQO.revisionId,
    })

    return persistedDocumentIndexes.map(DocumentIndexPersistenceAdapter.toDocumentIndex)
  }

  async findByUnreferencedSinceLessThanOrEqualOrderByIdAsc(
    documentIndexGarbageCandidatesQO: DocumentIndexGarbageCandidatesQO,
  ): Promise<DocumentIndex[]> {
    const persistedDocumentIndexes = await this.documentIndexModelRepository.find({
      where: { unreferencedSince: LessThanOrEqual(documentIndexGarbageCandidatesQO.cutoff) },
      order: { id: 'ASC' },
    })

    return persistedDocumentIndexes.map(DocumentIndexPersistenceAdapter.toDocumentIndex)
  }

  async deleteByDocumentIndexId(documentIndexIdQO: DocumentIndexIdQO): Promise<void> {
    await this.documentIndexModelRepository.delete({ id: documentIndexIdQO.documentIndexId })
  }

  async findByDocumentIdsOrderByCreatedAtAscAndIdAsc(
    documentIndexDocumentsQO: DocumentIndexDocumentsQO,
  ): Promise<DocumentIndex[]> {
    if (!documentIndexDocumentsQO.documentIds.length) return []

    const persistedDocumentIndexes = await this.documentIndexModelRepository.find({
      where: { documentId: In(documentIndexDocumentsQO.documentIds) },
      order: { createdAt: 'ASC', id: 'ASC' },
    })

    return persistedDocumentIndexes.map(DocumentIndexPersistenceAdapter.toDocumentIndex)
  }
}
