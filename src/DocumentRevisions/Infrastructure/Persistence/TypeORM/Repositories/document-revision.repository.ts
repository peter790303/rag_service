import { Injectable } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { In, LessThanOrEqual } from 'typeorm'

import { PersistenceTransaction } from '../../../../../Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import { DocumentRevisionRepository as DocumentRevisionRepositoryContract } from '../../../../Application/Ports/Out/Repositories/document-revision.repository.ts'
import type {
  CreateDocumentRevisionQO,
  DocumentRevisionContentQO,
  DocumentRevisionDocumentQO,
  DocumentRevisionDocumentScopeQO,
  DocumentRevisionGarbageCandidatesQO,
  DocumentRevisionIdQO,
  DocumentRevisionIdsQO,
} from '../../../../Application/QueryObjects/document-revision.query-object.ts'
import type { DocumentRevision } from '../../../../Domain/Entities/document-revision.ts'
import { DocumentRevisionPersistenceMapper } from '../Mappers/document-revision.persistence.mapper.ts'
import { DocumentRevisionModel } from '../Models/document-revision.model.ts'

/** Revision-primary persistence operations. */
@Injectable()
export class DocumentRevisionRepository extends DocumentRevisionRepositoryContract {
  constructor(private readonly persistenceTransaction: PersistenceTransaction) {
    super()
  }

  private get documentRevisionModelRepository(): Repository<DocumentRevisionModel> {
    return this.persistenceTransaction.manager.getRepository(DocumentRevisionModel)
  }

  async findByDocumentIdAndContentSha256(
    documentRevisionContentQO: DocumentRevisionContentQO,
  ): Promise<DocumentRevision | null> {
    const persistedRevision = await this.documentRevisionModelRepository.findOneBy({
      documentId: documentRevisionContentQO.documentId,
      contentSha256: documentRevisionContentQO.contentSha256,
    })

    return persistedRevision === null ? null : DocumentRevisionPersistenceMapper.toDocumentRevision(persistedRevision)
  }

  async create(createDocumentRevisionQO: CreateDocumentRevisionQO): Promise<void> {
    await this.documentRevisionModelRepository.insert(createDocumentRevisionQO)
  }

  async findByDocumentIdOrderByCreatedAtDesc(
    documentRevisionDocumentQO: DocumentRevisionDocumentQO,
  ): Promise<DocumentRevision | null> {
    const persistedRevision = await this.documentRevisionModelRepository.findOne({
      where: { documentId: documentRevisionDocumentQO.documentId },
      order: { createdAt: 'DESC' },
    })

    return persistedRevision === null ? null : DocumentRevisionPersistenceMapper.toDocumentRevision(persistedRevision)
  }

  async findByDocumentRevisionIdAndDocumentId(
    documentRevisionDocumentScopeQO: DocumentRevisionDocumentScopeQO,
  ): Promise<DocumentRevision | null> {
    const persistedRevision = await this.documentRevisionModelRepository.findOneBy({
      id: documentRevisionDocumentScopeQO.revisionId,
      documentId: documentRevisionDocumentScopeQO.documentId,
    })

    return persistedRevision === null ? null : DocumentRevisionPersistenceMapper.toDocumentRevision(persistedRevision)
  }

  async findByCreatedAtLessThanOrEqual(
    documentRevisionGarbageCandidatesQO: DocumentRevisionGarbageCandidatesQO,
  ): Promise<DocumentRevision[]> {
    const persistedRevisions = await this.documentRevisionModelRepository.findBy({
      createdAt: LessThanOrEqual(documentRevisionGarbageCandidatesQO.cutoff),
    })

    return persistedRevisions.map(DocumentRevisionPersistenceMapper.toDocumentRevision)
  }

  async lockByDocumentRevisionId(documentRevisionIdQO: DocumentRevisionIdQO): Promise<DocumentRevision | null> {
    const persistedRevision = await this.documentRevisionModelRepository.findOne({
      where: { id: documentRevisionIdQO.revisionId },
      lock: { mode: 'pessimistic_write' },
    })

    return persistedRevision === null ? null : DocumentRevisionPersistenceMapper.toDocumentRevision(persistedRevision)
  }

  async findByDocumentRevisionId(documentRevisionIdQO: DocumentRevisionIdQO): Promise<DocumentRevision | null> {
    const persistedRevision = await this.documentRevisionModelRepository.findOneBy({
      id: documentRevisionIdQO.revisionId,
    })

    return persistedRevision === null ? null : DocumentRevisionPersistenceMapper.toDocumentRevision(persistedRevision)
  }

  async deleteByDocumentRevisionId(documentRevisionIdQO: DocumentRevisionIdQO): Promise<void> {
    await this.documentRevisionModelRepository.delete({ id: documentRevisionIdQO.revisionId })
  }

  async findByDocumentRevisionIds(documentRevisionIdsQO: DocumentRevisionIdsQO): Promise<DocumentRevision[]> {
    if (!documentRevisionIdsQO.ids.length) return []

    const persistedRevisions = await this.documentRevisionModelRepository.findBy({ id: In(documentRevisionIdsQO.ids) })

    return persistedRevisions.map(DocumentRevisionPersistenceMapper.toDocumentRevision)
  }
}
