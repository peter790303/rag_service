import { Injectable } from '@nestjs/common'
import { type EntityManager, Repository } from 'typeorm'

import type { MarkdownPlan } from '../../../Domain/Knowledge/markdown-chunk.factory.js'
import { RagDocumentRelationModel } from '../Models/rag-document-relation.model.js'

/** Relation-primary persistence operations. */
@Injectable()
export class TypeOrmRagDocumentRelationRepository {
  async replaceForIndex(manager: EntityManager, documentIndexId: string, plan: MarkdownPlan): Promise<void> {
    const relationRepository: Repository<RagDocumentRelationModel> = manager.getRepository(RagDocumentRelationModel)
    const existingRelations = await relationRepository.findBy({ sourceIndexId: documentIndexId })

    if (existingRelations.length) await relationRepository.remove(existingRelations)

    const plannedRelations = plan.relations.map((plannedRelation) =>
      relationRepository.create({ sourceIndexId: documentIndexId, targetDocumentId: null, ...plannedRelation }),
    )

    if (plannedRelations.length) await relationRepository.save(plannedRelations)
  }

  async findForIndex(manager: EntityManager, documentIndexId: string): Promise<RagDocumentRelationModel[]> {
    return manager.getRepository(RagDocumentRelationModel).findBy({ sourceIndexId: documentIndexId })
  }

  async removeForIndex(manager: EntityManager, documentIndexId: string): Promise<void> {
    const relationRepository = manager.getRepository(RagDocumentRelationModel)
    const indexRelations = await relationRepository.findBy({ sourceIndexId: documentIndexId })

    if (indexRelations.length) await relationRepository.remove(indexRelations)
  }
}
