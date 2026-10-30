import { Injectable } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { In, IsNull, LessThanOrEqual } from 'typeorm'

import { PersistenceTransaction } from '../../../../../Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import { DocumentRepository as DocumentRepositoryContract } from '../../../../Application/Ports/Out/Repositories/document.repository.ts'
import type {
  DocumentGarbageCandidatesQO,
  DocumentIdQO,
  DocumentIdsQO,
  DocumentSourceQO,
  MarkDocumentUnreferencedQO,
  UpsertDocumentSourceQO,
  UpsertDocumentSourceTitleQO,
} from '../../../../Application/QueryObjects/document.query-object.ts'
import type { Document } from '../../../../Domain/Entities/document.ts'
import { DocumentPersistenceMapper } from '../Mappers/document.persistence.mapper.ts'
import { DocumentModel } from '../Models/document.model.ts'

@Injectable()
export class DocumentRepository extends DocumentRepositoryContract {
  constructor(private readonly persistenceTransaction: PersistenceTransaction) {
    super()
  }

  private get documentModelRepository(): Repository<DocumentModel> {
    return this.persistenceTransaction.manager.getRepository(DocumentModel)
  }

  async upsertBySourceTypeAndSourceKeyAndSourcePath(upsertDocumentSourceQO: UpsertDocumentSourceQO): Promise<void> {
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
    upsertDocumentSourceTitleQO: UpsertDocumentSourceTitleQO,
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

  async findBySourceTypeAndSourceKeyAndSourcePath(documentSourceQO: DocumentSourceQO): Promise<Document | null> {
    const persistedDocument = await this.documentModelRepository.findOneBy(documentSourceQO)

    return persistedDocument === null ? null : DocumentPersistenceMapper.toDocument(persistedDocument)
  }

  async lockByDocumentId(documentIdQO: DocumentIdQO): Promise<Document | null> {
    const persistedDocument = await this.documentModelRepository.findOne({
      where: { id: documentIdQO.documentId },
      lock: { mode: 'pessimistic_write' },
    })

    return persistedDocument === null ? null : DocumentPersistenceMapper.toDocument(persistedDocument)
  }

  async findByDocumentId(documentIdQO: DocumentIdQO): Promise<Document | null> {
    const persistedDocument = await this.documentModelRepository.findOneBy({ id: documentIdQO.documentId })

    return persistedDocument === null ? null : DocumentPersistenceMapper.toDocument(persistedDocument)
  }

  async lockByDocumentIdSkipLocked(documentIdQO: DocumentIdQO): Promise<Document | null> {
    const persistedDocument = await this.documentModelRepository.findOne({
      where: { id: documentIdQO.documentId },
      lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
    })

    return persistedDocument === null ? null : DocumentPersistenceMapper.toDocument(persistedDocument)
  }

  async findByUnreferencedSinceLessThanOrEqual(
    documentGarbageCandidatesQO: DocumentGarbageCandidatesQO,
  ): Promise<Document[]> {
    const persistedDocuments = await this.documentModelRepository.findBy({
      unreferencedSince: LessThanOrEqual(documentGarbageCandidatesQO.cutoff),
    })

    return persistedDocuments.map(DocumentPersistenceMapper.toDocument)
  }

  async updateUnreferencedSinceByDocumentIdAndUnreferencedSinceIsNull(
    markDocumentUnreferencedQO: MarkDocumentUnreferencedQO,
  ): Promise<void> {
    await this.documentModelRepository.update(
      { id: markDocumentUnreferencedQO.documentId, unreferencedSince: IsNull() },
      { unreferencedSince: markDocumentUnreferencedQO.unreferencedSince },
    )
  }

  async deleteByDocumentId(documentIdQO: DocumentIdQO): Promise<void> {
    await this.documentModelRepository.delete({ id: documentIdQO.documentId })
  }

  async findByDocumentIds(documentIdsQO: DocumentIdsQO): Promise<Document[]> {
    if (!documentIdsQO.ids.length) return []

    const persistedDocuments = await this.documentModelRepository.findBy({ id: In(documentIdsQO.ids) })

    return persistedDocuments.map(DocumentPersistenceMapper.toDocument)
  }
}
