import { Injectable } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { In } from 'typeorm'

import { PersistenceTransaction } from '../../../../../Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import { DocumentRelationRepository as DocumentRelationRepositoryContract } from '../../../../Application/Ports/Out/Repositories/document-relation.repository.ts'
import type {
  DocumentRelationSourceIndexQueryObject,
  DocumentRelationSourceIndexesQueryObject,
  DocumentRelationTargetDocumentQueryObject,
  InsertPlannedDocumentRelationsQueryObject,
} from '../../../../Application/QueryObjects/document-relation.query-object.ts'
import type { DocumentRelation } from '../../../../Domain/Entities/document-relation.ts'
import { DocumentRelationPersistenceMapper } from '../Mappers/document-relation.persistence.mapper.ts'
import { DocumentRelationModel } from '../Models/document-relation.model.ts'

/** Relation-primary persistence operations. */
@Injectable()
export class DocumentRelationRepository extends DocumentRelationRepositoryContract {
  constructor(private readonly persistenceTransaction: PersistenceTransaction) {
    super()
  }

  private get documentRelationModelRepository(): Repository<DocumentRelationModel> {
    return this.persistenceTransaction.manager.getRepository(DocumentRelationModel)
  }

  async insertPlanned(insertPlannedDocumentRelationsQO: InsertPlannedDocumentRelationsQueryObject): Promise<void> {
    if (!insertPlannedDocumentRelationsQO.relations.length) return

    await this.documentRelationModelRepository.insert([...insertPlannedDocumentRelationsQO.relations])
  }

  async findBySourceIndexId(
    documentRelationSourceIndexQO: DocumentRelationSourceIndexQueryObject,
  ): Promise<DocumentRelation[]> {
    const models = await this.documentRelationModelRepository.findBy({
      sourceIndexId: documentRelationSourceIndexQO.sourceIndexId,
    })

    return models.map(DocumentRelationPersistenceMapper.toDocumentRelation)
  }

  async removeBySourceIndexId(documentRelationSourceIndexQO: DocumentRelationSourceIndexQueryObject): Promise<void> {
    await this.documentRelationModelRepository.delete({ sourceIndexId: documentRelationSourceIndexQO.sourceIndexId })
  }

  async findByTargetDocumentId(
    documentRelationTargetDocumentQO: DocumentRelationTargetDocumentQueryObject,
  ): Promise<DocumentRelation | null> {
    const model = await this.documentRelationModelRepository.findOneBy({
      targetDocumentId: documentRelationTargetDocumentQO.documentId,
    })

    return model === null ? null : DocumentRelationPersistenceMapper.toDocumentRelation(model)
  }

  async findBySourceIndexIdsOrderByIdAsc(
    documentRelationSourceIndexesQO: DocumentRelationSourceIndexesQueryObject,
  ): Promise<DocumentRelation[]> {
    if (!documentRelationSourceIndexesQO.sourceIndexIds.length) return []

    const models = await this.documentRelationModelRepository.find({
      where: { sourceIndexId: In(documentRelationSourceIndexesQO.sourceIndexIds) },
      order: { id: 'ASC' },
    })

    return models.map(DocumentRelationPersistenceMapper.toDocumentRelation)
  }
}
