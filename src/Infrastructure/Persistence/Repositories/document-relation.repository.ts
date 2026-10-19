import { Injectable } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { In } from 'typeorm'

import { DocumentRelationRepository as DocumentRelationRepositoryContract } from '../../../Application/DocumentRelations/Contracts/document-relation.repository.ts'
import type {
  DocumentRelationSourceIndexQueryObject,
  DocumentRelationSourceIndexesQueryObject,
  DocumentRelationTargetDocumentQueryObject,
  InsertPlannedDocumentRelationsQueryObject,
} from '../../../Application/DocumentRelations/QueryObjects/document-relation.query-object.ts'
import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import { DocumentRelationFactory } from '../Factories/document-relation.factory.ts'
import { DocumentRelationModel } from '../Models/document-relation.model.ts'
import { PersistenceTransaction } from '../persistence-transaction.ts'

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

    return models.map(DocumentRelationFactory.toDocumentRelation)
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

    return model === null ? null : DocumentRelationFactory.toDocumentRelation(model)
  }

  async findBySourceIndexIdsOrderByIdAsc(
    documentRelationSourceIndexesQO: DocumentRelationSourceIndexesQueryObject,
  ): Promise<DocumentRelation[]> {
    if (!documentRelationSourceIndexesQO.sourceIndexIds.length) return []

    const models = await this.documentRelationModelRepository.find({
      where: { sourceIndexId: In(documentRelationSourceIndexesQO.sourceIndexIds) },
      order: { id: 'ASC' },
    })

    return models.map(DocumentRelationFactory.toDocumentRelation)
  }
}
