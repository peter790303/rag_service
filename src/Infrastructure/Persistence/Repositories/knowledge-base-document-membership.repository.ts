import { Injectable } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { IsNull } from 'typeorm'

import { MembershipRepository as MembershipRepositoryContract } from '../../../Application/Memberships/Contracts/membership.repository.ts'
import type {
  InsertMembershipQueryObject,
  MembershipActivationQueryObject,
  MembershipActiveIndexQueryObject,
  MembershipDocumentQueryObject,
  MembershipKnowledgeBaseQueryObject,
  MembershipSourceQueryObject,
  SaveMembershipRequestQueryObject,
  UpdateMembershipQueryObject,
  UpdateMembershipActiveIndexQueryObject,
} from '../../../Application/Memberships/QueryObjects/membership.query-object.ts'
import type { Membership } from '../../../Domain/Membership/membership.ts'
import { MembershipFactory } from '../Factories/membership.factory.ts'
import { KnowledgeBaseDocumentMembershipModel } from '../Models/knowledge-base-document-membership.model.ts'
import { PersistenceTransaction } from '../persistence-transaction.ts'

@Injectable()
export class KnowledgeBaseDocumentMembershipRepository extends MembershipRepositoryContract {
  constructor(private readonly persistenceTransaction: PersistenceTransaction) {
    super()
  }

  private get knowledgeBaseDocumentMembershipModelRepository(): Repository<KnowledgeBaseDocumentMembershipModel> {
    return this.persistenceTransaction.manager.getRepository(KnowledgeBaseDocumentMembershipModel)
  }

  async findByKnowledgeBaseIdAndDocumentId(
    membershipSourceQO: MembershipSourceQueryObject,
  ): Promise<Membership | null> {
    const persistedMembership = await this.knowledgeBaseDocumentMembershipModelRepository.findOneBy({
      knowledgeBaseId: membershipSourceQO.knowledgeBaseId,
      documentId: membershipSourceQO.documentId,
    })

    return persistedMembership === null ? null : MembershipFactory.toMembership(persistedMembership)
  }

  async lockByKnowledgeBaseIdAndDocumentId(
    membershipSourceQO: MembershipSourceQueryObject,
  ): Promise<Membership | null> {
    const persistedMembership = await this.knowledgeBaseDocumentMembershipModelRepository.findOne({
      where: { knowledgeBaseId: membershipSourceQO.knowledgeBaseId, documentId: membershipSourceQO.documentId },
      lock: { mode: 'pessimistic_write' },
    })

    return persistedMembership === null ? null : MembershipFactory.toMembership(persistedMembership)
  }

  async lockByKnowledgeBaseIdAndDocumentIdSkipLocked(
    membershipSourceQO: MembershipSourceQueryObject,
  ): Promise<Membership | null> {
    const persistedMembership = await this.knowledgeBaseDocumentMembershipModelRepository.findOne({
      where: { knowledgeBaseId: membershipSourceQO.knowledgeBaseId, documentId: membershipSourceQO.documentId },
      lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
    })

    return persistedMembership === null ? null : MembershipFactory.toMembership(persistedMembership)
  }

  async insert(insertMembershipQO: InsertMembershipQueryObject): Promise<void> {
    await this.knowledgeBaseDocumentMembershipModelRepository.insert({
      knowledgeBaseId: insertMembershipQO.knowledgeBaseId,
      documentId: insertMembershipQO.documentId,
      isEntry: insertMembershipQO.isEntry,
      alwaysIncludeFullContent: insertMembershipQO.alwaysIncludeFullContent,
      activeDocumentIndexId: insertMembershipQO.activeDocumentIndexId,
      requestedGeneration: insertMembershipQO.requestedGeneration,
      updatedAt: insertMembershipQO.updatedAt,
    })
  }

  async updateByKnowledgeBaseIdAndDocumentId(updateMembershipQO: UpdateMembershipQueryObject): Promise<void> {
    await this.knowledgeBaseDocumentMembershipModelRepository.update(
      { knowledgeBaseId: updateMembershipQO.knowledgeBaseId, documentId: updateMembershipQO.documentId },
      {
        isEntry: updateMembershipQO.isEntry,
        alwaysIncludeFullContent: updateMembershipQO.alwaysIncludeFullContent,
        activeDocumentIndexId: updateMembershipQO.activeDocumentIndexId,
        requestedGeneration: updateMembershipQO.requestedGeneration,
        updatedAt: updateMembershipQO.updatedAt,
      },
    )
  }

  async updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentId(
    updateMembershipActiveIndexQO: UpdateMembershipActiveIndexQueryObject,
  ): Promise<void> {
    await this.knowledgeBaseDocumentMembershipModelRepository.update(
      {
        knowledgeBaseId: updateMembershipActiveIndexQO.knowledgeBaseId,
        documentId: updateMembershipActiveIndexQO.documentId,
      },
      {
        activeDocumentIndexId: updateMembershipActiveIndexQO.activeDocumentIndexId,
        updatedAt: updateMembershipActiveIndexQO.updatedAt,
      },
    )
  }

  async removeByKnowledgeBaseIdAndDocumentId(membershipSourceQO: MembershipSourceQueryObject): Promise<void> {
    await this.knowledgeBaseDocumentMembershipModelRepository.delete({
      knowledgeBaseId: membershipSourceQO.knowledgeBaseId,
      documentId: membershipSourceQO.documentId,
    })
  }

  async updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId(
    membershipActivationQO: MembershipActivationQueryObject,
  ): Promise<Membership | null> {
    const membershipActivationUpdate = await this.knowledgeBaseDocumentMembershipModelRepository.update(
      {
        knowledgeBaseId: membershipActivationQO.knowledgeBaseId,
        documentId: membershipActivationQO.documentId,
        requestedGeneration: membershipActivationQO.requestedGeneration,
        activeDocumentIndexId:
          membershipActivationQO.expectedActiveDocumentIndexId === null
            ? IsNull()
            : membershipActivationQO.expectedActiveDocumentIndexId,
      },
      { activeDocumentIndexId: membershipActivationQO.documentIndexId, updatedAt: membershipActivationQO.updatedAt },
    )

    if ((membershipActivationUpdate.affected ?? 0) !== 1) return null

    return this.findByKnowledgeBaseIdAndDocumentId(membershipActivationQO)
  }

  async saveRequest(saveMembershipRequestQO: SaveMembershipRequestQueryObject): Promise<Membership> {
    const persistedMembership = await this.knowledgeBaseDocumentMembershipModelRepository.save({
      knowledgeBaseId: saveMembershipRequestQO.knowledgeBaseId,
      documentId: saveMembershipRequestQO.documentId,
      isEntry: saveMembershipRequestQO.isEntry,
      alwaysIncludeFullContent: saveMembershipRequestQO.alwaysIncludeFullContent,
      activeDocumentIndexId: saveMembershipRequestQO.activeDocumentIndexId,
      requestedGeneration: saveMembershipRequestQO.requestedGeneration,
      updatedAt: saveMembershipRequestQO.updatedAt,
    })

    return MembershipFactory.toMembership(persistedMembership)
  }

  async findByActiveDocumentIndexId(
    membershipActiveIndexQO: MembershipActiveIndexQueryObject,
  ): Promise<Membership | null> {
    const persistedMembership = await this.knowledgeBaseDocumentMembershipModelRepository.findOneBy({
      activeDocumentIndexId: membershipActiveIndexQO.documentIndexId,
    })

    return persistedMembership === null ? null : MembershipFactory.toMembership(persistedMembership)
  }

  async findByKnowledgeBaseIdOrderByDocumentIdAsc(
    membershipKnowledgeBaseQO: MembershipKnowledgeBaseQueryObject,
  ): Promise<Membership[]> {
    const persistedMemberships = await this.knowledgeBaseDocumentMembershipModelRepository.find({
      where: { knowledgeBaseId: membershipKnowledgeBaseQO.knowledgeBaseId },
      order: { documentId: 'ASC' },
    })

    return persistedMemberships.map(MembershipFactory.toMembership)
  }

  async findByDocumentId(membershipDocumentQO: MembershipDocumentQueryObject): Promise<Membership | null> {
    const persistedMembership = await this.knowledgeBaseDocumentMembershipModelRepository.findOneBy({
      documentId: membershipDocumentQO.documentId,
    })

    return persistedMembership === null ? null : MembershipFactory.toMembership(persistedMembership)
  }
}
