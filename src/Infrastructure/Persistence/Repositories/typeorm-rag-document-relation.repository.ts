import { Injectable } from '@nestjs/common'
import { type EntityManager, In } from 'typeorm'

import type { PlannedRelation } from '../../../Domain/Knowledge/markdown-chunk.factory.js'
import { RagDocumentRelationModel } from '../Models/rag-document-relation.model.js'

/** Relation-primary persistence operations. */
@Injectable()
export class TypeOrmRagDocumentRelationRepository {
  async savePlannedIn(
    manager: EntityManager,
    documentIndexId: string,
    relations: readonly PlannedRelation[],
  ): Promise<void> {
    if (!relations.length) return

    const repository = manager.getRepository(RagDocumentRelationModel)
    await repository.save(
      relations.map((relation) =>
        repository.create({
          sourceIndexId: documentIndexId,
          targetDocumentId: null,
          targetReference: relation.targetReference,
          targetAnchor: relation.targetAnchor,
          relationType: relation.relationType,
          evidenceBlockStart: relation.evidenceBlockStart,
          evidenceBlockEnd: relation.evidenceBlockEnd,
          evidenceText: relation.evidenceText,
        }),
      ),
    )
  }

  async findForIndex(manager: EntityManager, documentIndexId: string): Promise<RagDocumentRelationModel[]> {
    return manager.getRepository(RagDocumentRelationModel).findBy({ sourceIndexId: documentIndexId })
  }

  async removeForIndex(manager: EntityManager, documentIndexId: string): Promise<void> {
    const relationRepository = manager.getRepository(RagDocumentRelationModel)
    const indexRelations = await relationRepository.findBy({ sourceIndexId: documentIndexId })

    if (indexRelations.length) await relationRepository.remove(indexRelations)
  }

  async countTargetDocumentReferencesIn(manager: EntityManager, documentId: string): Promise<number> {
    return manager.getRepository(RagDocumentRelationModel).countBy({ targetDocumentId: documentId })
  }

  async findForSourceIndexIdsIn(manager: EntityManager, sourceIndexIds: string[]): Promise<RagDocumentRelationModel[]> {
    if (!sourceIndexIds.length) return []

    return manager.getRepository(RagDocumentRelationModel).find({
      where: { sourceIndexId: In(sourceIndexIds) },
      order: { id: 'ASC' },
    })
  }
}
