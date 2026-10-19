import { Injectable } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { In, IsNull, LessThanOrEqual } from 'typeorm'

import { DocumentRepository as DocumentRepositoryContract } from '../../../Application/Documents/Contracts/document.repository.ts'
import type {
  DocumentGarbageCandidatesQueryObject,
  DocumentIdQueryObject,
  DocumentIdsQueryObject,
  DocumentSourceQueryObject,
  MarkDocumentUnreferencedQueryObject,
  UpsertDocumentSourceQueryObject,
  UpsertDocumentSourceTitleQueryObject,
} from '../../../Application/Documents/QueryObjects/document.query-object.ts'
import type { Document } from '../../../Domain/Document/document.ts'
import { DocumentFactory } from '../Factories/document.factory.ts'
import { DocumentModel } from '../Models/document.model.ts'
import { PersistenceTransaction } from '../persistence-transaction.ts'

@Injectable()
export class DocumentRepository extends DocumentRepositoryContract {
  constructor(private readonly persistenceTransaction: PersistenceTransaction) {
    super()
  }

  private get documentModelRepository(): Repository<DocumentModel> {
    return this.persistenceTransaction.manager.getRepository(DocumentModel)
  }

  async upsertBySourceTypeAndSourceKeyAndSourcePath(
    upsertDocumentSourceQO: UpsertDocumentSourceQueryObject,
  ): Promise<void> {
    // Keep the conflict update even when values match: its row lock lasts for
    // the caller's transaction, protecting document references from GC.
    await this.documentModelRepository.upsert(
      {
        id: upsertDocumentSourceQO.id,
        sourceType: upsertDocumentSourceQO.sourceType,
        sourceKey: upsertDocumentSourceQO.sourceKey,
        sourcePath: upsertDocumentSourceQO.sourcePath,
        createdAt: upsertDocumentSourceQO.createdAt,
        unreferencedSince: upsertDocumentSourceQO.unreferencedSince,
      },
      {
        conflictPaths: { sourceType: true, sourceKey: true, sourcePath: true },
        skipUpdateIfNoValuesChanged: false,
      },
    )
  }

  async upsertTitleBySourceTypeAndSourceKeyAndSourcePath(
    upsertDocumentSourceTitleQO: UpsertDocumentSourceTitleQueryObject,
  ): Promise<void> {
    // The conflict write retains the source row lock for the caller's transaction.
    await this.documentModelRepository.upsert(
      {
        id: upsertDocumentSourceTitleQO.id,
        sourceType: upsertDocumentSourceTitleQO.sourceType,
        sourceKey: upsertDocumentSourceTitleQO.sourceKey,
        sourcePath: upsertDocumentSourceTitleQO.sourcePath,
        createdAt: upsertDocumentSourceTitleQO.createdAt,
        currentTitle: upsertDocumentSourceTitleQO.currentTitle,
        unreferencedSince: upsertDocumentSourceTitleQO.unreferencedSince,
      },
      {
        conflictPaths: { sourceType: true, sourceKey: true, sourcePath: true },
        skipUpdateIfNoValuesChanged: false,
      },
    )
  }

  async findBySourceTypeAndSourceKeyAndSourcePath(
    documentSourceQO: DocumentSourceQueryObject,
  ): Promise<Document | null> {
    const persistedDocument = await this.documentModelRepository.findOneBy(documentSourceQO)

    return persistedDocument === null ? null : DocumentFactory.toDocument(persistedDocument)
  }

  async lockByDocumentId(documentIdQO: DocumentIdQueryObject): Promise<Document | null> {
    const persistedDocument = await this.documentModelRepository.findOne({
      where: { id: documentIdQO.documentId },
      lock: { mode: 'pessimistic_write' },
    })

    return persistedDocument === null ? null : DocumentFactory.toDocument(persistedDocument)
  }

  async findByDocumentId(documentIdQO: DocumentIdQueryObject): Promise<Document | null> {
    const persistedDocument = await this.documentModelRepository.findOneBy({ id: documentIdQO.documentId })

    return persistedDocument === null ? null : DocumentFactory.toDocument(persistedDocument)
  }

  async lockByDocumentIdSkipLocked(documentIdQO: DocumentIdQueryObject): Promise<Document | null> {
    const persistedDocument = await this.documentModelRepository.findOne({
      where: { id: documentIdQO.documentId },
      lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
    })

    return persistedDocument === null ? null : DocumentFactory.toDocument(persistedDocument)
  }

  async findByUnreferencedSinceLessThanOrEqual(
    documentGarbageCandidatesQO: DocumentGarbageCandidatesQueryObject,
  ): Promise<Document[]> {
    const persistedDocuments = await this.documentModelRepository.findBy({
      unreferencedSince: LessThanOrEqual(documentGarbageCandidatesQO.cutoff),
    })

    return persistedDocuments.map(DocumentFactory.toDocument)
  }

  async updateUnreferencedSinceByDocumentIdAndUnreferencedSinceIsNull(
    markDocumentUnreferencedQO: MarkDocumentUnreferencedQueryObject,
  ): Promise<void> {
    await this.documentModelRepository.update(
      { id: markDocumentUnreferencedQO.documentId, unreferencedSince: IsNull() },
      { unreferencedSince: markDocumentUnreferencedQO.unreferencedSince },
    )
  }

  async deleteByDocumentId(documentIdQO: DocumentIdQueryObject): Promise<void> {
    await this.documentModelRepository.delete({ id: documentIdQO.documentId })
  }

  async findByDocumentIds(documentIdsQO: DocumentIdsQueryObject): Promise<Document[]> {
    if (!documentIdsQO.ids.length) return []

    const persistedDocuments = await this.documentModelRepository.findBy({ id: In(documentIdsQO.ids) })

    return persistedDocuments.map(DocumentFactory.toDocument)
  }
}
