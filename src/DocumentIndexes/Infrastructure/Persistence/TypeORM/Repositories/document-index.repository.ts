import { Injectable } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { In } from 'typeorm'
import { LessThanOrEqual } from 'typeorm'

import { PersistenceTransaction } from '../../../../../Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import { DocumentIndexRepository as DocumentIndexRepositoryContract } from '../../../../Application/Ports/Out/Repositories/document-index.repository.ts'
import type {
  CreateBuildingDocumentIndexQueryObject,
  SaveDocumentIndexLifecycleQueryObject,
  SetDocumentIndexUnreferencedSinceQueryObject,
} from '../../../../Application/QueryObjects/document-index.query-object.ts'
import type {
  DocumentIndexDocumentQueryObject,
  DocumentIndexDocumentsQueryObject,
  DocumentIndexGarbageCandidatesQueryObject,
  DocumentIndexIdQueryObject,
  DocumentIndexRevisionPipelineQueryObject,
  DocumentIndexRevisionQueryObject,
} from '../../../../Application/QueryObjects/document-index.query-object.ts'
import type { DocumentIndex } from '../../../../Domain/Entities/document-index.ts'
import { DocumentIndexPersistenceMapper } from '../Mappers/document-index.persistence.mapper.ts'
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
    documentIndexRevisionPipelineQO: DocumentIndexRevisionPipelineQueryObject,
  ): Promise<DocumentIndex | null> {
    const persistedDocumentIndex = await this.documentIndexModelRepository.findOneBy({
      revisionId: documentIndexRevisionPipelineQO.revisionId,
      pipelineHash: documentIndexRevisionPipelineQO.pipelineHash,
    })

    return persistedDocumentIndex === null
      ? null
      : DocumentIndexPersistenceMapper.toDocumentIndex(persistedDocumentIndex)
  }

  async createBuildingIndex(createBuildingDocumentIndexQO: CreateBuildingDocumentIndexQueryObject): Promise<void> {
    await this.documentIndexModelRepository.insert(createBuildingDocumentIndexQO)
  }

  async lockByDocumentIndexId(documentIndexIdQO: DocumentIndexIdQueryObject): Promise<DocumentIndex | null> {
    const persistedDocumentIndex = await this.documentIndexModelRepository.findOne({
      where: { id: documentIndexIdQO.documentIndexId },
      lock: { mode: 'pessimistic_write' },
    })

    return persistedDocumentIndex === null
      ? null
      : DocumentIndexPersistenceMapper.toDocumentIndex(persistedDocumentIndex)
  }

  async lockByDocumentIndexIdSkipLocked(documentIndexIdQO: DocumentIndexIdQueryObject): Promise<DocumentIndex | null> {
    const persistedDocumentIndex = await this.documentIndexModelRepository.findOne({
      where: { id: documentIndexIdQO.documentIndexId },
      lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
    })

    return persistedDocumentIndex === null
      ? null
      : DocumentIndexPersistenceMapper.toDocumentIndex(persistedDocumentIndex)
  }

  async findByDocumentIndexId(documentIndexIdQO: DocumentIndexIdQueryObject): Promise<DocumentIndex | null> {
    const persistedDocumentIndex = await this.documentIndexModelRepository.findOneBy({
      id: documentIndexIdQO.documentIndexId,
    })

    return persistedDocumentIndex === null
      ? null
      : DocumentIndexPersistenceMapper.toDocumentIndex(persistedDocumentIndex)
  }

  async updateByDocumentIndexIdWithLifecycleFields(
    saveDocumentIndexLifecycleQO: SaveDocumentIndexLifecycleQueryObject,
  ): Promise<void> {
    const { documentIndexId, ...lifecycleFields } = saveDocumentIndexLifecycleQO
    await this.documentIndexModelRepository.update({ id: documentIndexId }, lifecycleFields)
  }

  async updateByDocumentIndexIdWithUnreferencedSince(
    setDocumentIndexUnreferencedSinceQO: SetDocumentIndexUnreferencedSinceQueryObject,
  ): Promise<void> {
    await this.documentIndexModelRepository.update(
      { id: setDocumentIndexUnreferencedSinceQO.documentIndexId },
      { unreferencedSince: setDocumentIndexUnreferencedSinceQO.unreferencedSince },
    )
  }

  async findByDocumentId(documentIndexDocumentQO: DocumentIndexDocumentQueryObject): Promise<DocumentIndex[]> {
    const persistedDocumentIndexes = await this.documentIndexModelRepository.findBy({
      documentId: documentIndexDocumentQO.documentId,
    })

    return persistedDocumentIndexes.map(DocumentIndexPersistenceMapper.toDocumentIndex)
  }

  async findByRevisionId(documentIndexRevisionQO: DocumentIndexRevisionQueryObject): Promise<DocumentIndex[]> {
    const persistedDocumentIndexes = await this.documentIndexModelRepository.findBy({
      revisionId: documentIndexRevisionQO.revisionId,
    })

    return persistedDocumentIndexes.map(DocumentIndexPersistenceMapper.toDocumentIndex)
  }

  async findByUnreferencedSinceLessThanOrEqualOrderByIdAsc(
    documentIndexGarbageCandidatesQO: DocumentIndexGarbageCandidatesQueryObject,
  ): Promise<DocumentIndex[]> {
    const persistedDocumentIndexes = await this.documentIndexModelRepository.find({
      where: { unreferencedSince: LessThanOrEqual(documentIndexGarbageCandidatesQO.cutoff) },
      order: { id: 'ASC' },
    })

    return persistedDocumentIndexes.map(DocumentIndexPersistenceMapper.toDocumentIndex)
  }

  async deleteByDocumentIndexId(documentIndexIdQO: DocumentIndexIdQueryObject): Promise<void> {
    await this.documentIndexModelRepository.delete({ id: documentIndexIdQO.documentIndexId })
  }

  async findByDocumentIdsOrderByCreatedAtAscAndIdAsc(
    documentIndexDocumentsQO: DocumentIndexDocumentsQueryObject,
  ): Promise<DocumentIndex[]> {
    if (!documentIndexDocumentsQO.documentIds.length) return []

    const persistedDocumentIndexes = await this.documentIndexModelRepository.find({
      where: { documentId: In(documentIndexDocumentsQO.documentIds) },
      order: { createdAt: 'ASC', id: 'ASC' },
    })

    return persistedDocumentIndexes.map(DocumentIndexPersistenceMapper.toDocumentIndex)
  }
}
