import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, IsNull, Repository } from 'typeorm'

import type { RagMembershipActivation } from '../../../Application/KnowledgeBases/Contracts/rag-job-claim-transaction.js'
import { RagMembershipModel } from '../Models/rag-membership.model.js'

@Injectable()
export class TypeOrmRagMembershipRepository {
  constructor(@InjectRepository(RagMembershipModel) private readonly memberships: Repository<RagMembershipModel>) {}

  async findForSource(knowledgeBaseId: string, documentId: string): Promise<RagMembershipModel | null> {
    return this.memberships.findOneBy({ knowledgeBaseId, documentId })
  }

  async lockMembership(
    manager: EntityManager,
    knowledgeBaseId: string,
    documentId: string,
  ): Promise<RagMembershipModel | null> {
    return manager.getRepository(RagMembershipModel).findOne({
      where: { knowledgeBaseId, documentId },
      lock: { mode: 'pessimistic_write' },
    })
  }

  async lockAvailableMembershipIn(
    manager: EntityManager,
    knowledgeBaseId: string,
    documentId: string,
  ): Promise<RagMembershipModel | null> {
    return manager
      .getRepository(RagMembershipModel)
      .createQueryBuilder('membership')
      .where('membership.knowledgeBaseId = :knowledgeBaseId', { knowledgeBaseId })
      .andWhere('membership.documentId = :documentId', { documentId })
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .getOne()
  }

  async existsIn(manager: EntityManager, knowledgeBaseId: string, documentId: string): Promise<boolean> {
    return manager.getRepository(RagMembershipModel).existsBy({ knowledgeBaseId, documentId })
  }

  async setActiveIndexIfCurrentIn(manager: EntityManager, activation: RagMembershipActivation): Promise<boolean> {
    const result = await manager.getRepository(RagMembershipModel).update(
      {
        knowledgeBaseId: activation.knowledgeBaseId,
        documentId: activation.documentId,
        requestedGeneration: activation.requestedGeneration,
        activeDocumentIndexId:
          activation.expectedActiveDocumentIndexId === null ? IsNull() : activation.expectedActiveDocumentIndexId,
      },
      { activeDocumentIndexId: activation.documentIndexId },
    )

    return (result.affected ?? 0) === 1
  }

  async saveRequest(membership: RagMembershipModel): Promise<RagMembershipModel> {
    return this.memberships.save(membership)
  }

  async saveRequestIn(manager: EntityManager, membership: RagMembershipModel): Promise<RagMembershipModel> {
    return manager.getRepository(RagMembershipModel).save(membership)
  }

  async findActiveReference(documentIndexId: string): Promise<RagMembershipModel | null> {
    return this.memberships.findOneBy({ activeDocumentIndexId: documentIndexId })
  }

  async findActiveReferenceIn(manager: EntityManager, documentIndexId: string): Promise<RagMembershipModel | null> {
    return manager.getRepository(RagMembershipModel).findOneBy({ activeDocumentIndexId: documentIndexId })
  }

  async findForKnowledgeBase(manager: EntityManager, knowledgeBaseId: string): Promise<RagMembershipModel[]> {
    return manager.getRepository(RagMembershipModel).find({
      where: { knowledgeBaseId },
      order: { documentId: 'ASC' },
    })
  }

  async remove(manager: EntityManager, membership: RagMembershipModel): Promise<void> {
    await manager.getRepository(RagMembershipModel).remove(membership)
  }

  async countForDocumentIn(manager: EntityManager, documentId: string): Promise<number> {
    return manager.getRepository(RagMembershipModel).countBy({ documentId })
  }

  async findForSourceIn(
    manager: EntityManager,
    knowledgeBaseId: string,
    documentId: string,
  ): Promise<RagMembershipModel | null> {
    return manager.getRepository(RagMembershipModel).findOneBy({ knowledgeBaseId, documentId })
  }

  async countActiveReferences(manager: EntityManager, documentIndexId: string): Promise<number> {
    return manager.getRepository(RagMembershipModel).countBy({ activeDocumentIndexId: documentIndexId })
  }
}
