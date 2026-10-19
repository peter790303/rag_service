import { Injectable } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { In, LessThanOrEqual } from 'typeorm'

import { DocumentRevisionRepository as DocumentRevisionRepositoryContract } from '../../../Application/DocumentRevisions/Contracts/document-revision.repository.ts'
import type {
  CreateDocumentRevisionQueryObject,
  DocumentRevisionContentQueryObject,
  DocumentRevisionDocumentQueryObject,
  DocumentRevisionDocumentScopeQueryObject,
  DocumentRevisionGarbageCandidatesQueryObject,
  DocumentRevisionIdQueryObject,
  DocumentRevisionIdsQueryObject,
} from '../../../Application/DocumentRevisions/QueryObjects/document-revision.query-object.ts'
import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import { DocumentRevisionFactory } from '../Factories/document-revision.factory.ts'
import { DocumentRevisionModel } from '../Models/document-revision.model.ts'
import { PersistenceTransaction } from '../persistence-transaction.ts'

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
    documentRevisionContentQO: DocumentRevisionContentQueryObject,
  ): Promise<DocumentRevision | null> {
    const persistedRevision = await this.documentRevisionModelRepository.findOneBy({
      documentId: documentRevisionContentQO.documentId,
      contentSha256: documentRevisionContentQO.contentSha256,
    })

    return persistedRevision === null ? null : DocumentRevisionFactory.toDocumentRevision(persistedRevision)
  }

  async create(createDocumentRevisionQO: CreateDocumentRevisionQueryObject): Promise<void> {
    await this.documentRevisionModelRepository.insert(createDocumentRevisionQO)
  }

  async findByDocumentIdOrderByCreatedAtDesc(
    documentRevisionDocumentQO: DocumentRevisionDocumentQueryObject,
  ): Promise<DocumentRevision | null> {
    const persistedRevision = await this.documentRevisionModelRepository.findOne({
      where: { documentId: documentRevisionDocumentQO.documentId },
      order: { createdAt: 'DESC' },
    })

    return persistedRevision === null ? null : DocumentRevisionFactory.toDocumentRevision(persistedRevision)
  }

  async findByDocumentRevisionIdAndDocumentId(
    documentRevisionDocumentScopeQO: DocumentRevisionDocumentScopeQueryObject,
  ): Promise<DocumentRevision | null> {
    const persistedRevision = await this.documentRevisionModelRepository.findOneBy({
      id: documentRevisionDocumentScopeQO.revisionId,
      documentId: documentRevisionDocumentScopeQO.documentId,
    })

    return persistedRevision === null ? null : DocumentRevisionFactory.toDocumentRevision(persistedRevision)
  }

  async findByCreatedAtLessThanOrEqual(
    documentRevisionGarbageCandidatesQO: DocumentRevisionGarbageCandidatesQueryObject,
  ): Promise<DocumentRevision[]> {
    const persistedRevisions = await this.documentRevisionModelRepository.findBy({
      createdAt: LessThanOrEqual(documentRevisionGarbageCandidatesQO.cutoff),
    })

    return persistedRevisions.map(DocumentRevisionFactory.toDocumentRevision)
  }

  async lockByDocumentRevisionId(
    documentRevisionIdQO: DocumentRevisionIdQueryObject,
  ): Promise<DocumentRevision | null> {
    const persistedRevision = await this.documentRevisionModelRepository.findOne({
      where: { id: documentRevisionIdQO.revisionId },
      lock: { mode: 'pessimistic_write' },
    })

    return persistedRevision === null ? null : DocumentRevisionFactory.toDocumentRevision(persistedRevision)
  }

  async findByDocumentRevisionId(
    documentRevisionIdQO: DocumentRevisionIdQueryObject,
  ): Promise<DocumentRevision | null> {
    const persistedRevision = await this.documentRevisionModelRepository.findOneBy({
      id: documentRevisionIdQO.revisionId,
    })

    return persistedRevision === null ? null : DocumentRevisionFactory.toDocumentRevision(persistedRevision)
  }

  async deleteByDocumentRevisionId(documentRevisionIdQO: DocumentRevisionIdQueryObject): Promise<void> {
    await this.documentRevisionModelRepository.delete({ id: documentRevisionIdQO.revisionId })
  }

  async findByDocumentRevisionIds(documentRevisionIdsQO: DocumentRevisionIdsQueryObject): Promise<DocumentRevision[]> {
    if (!documentRevisionIdsQO.ids.length) return []

    const persistedRevisions = await this.documentRevisionModelRepository.findBy({ id: In(documentRevisionIdsQO.ids) })

    return persistedRevisions.map(DocumentRevisionFactory.toDocumentRevision)
  }
}
