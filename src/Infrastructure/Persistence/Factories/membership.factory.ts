import { Membership } from '../../../Domain/Membership/membership.ts'
import type { KnowledgeBaseDocumentMembershipModel } from '../Models/knowledge-base-document-membership.model.ts'

export class MembershipFactory {
  static toMembership(membershipModel: KnowledgeBaseDocumentMembershipModel): Membership {
    return new Membership({
      knowledgeBaseId: membershipModel.knowledgeBaseId,
      documentId: membershipModel.documentId,
      requestedGeneration: membershipModel.requestedGeneration,
      activeDocumentIndexId: membershipModel.activeDocumentIndexId,
      isEntry: membershipModel.isEntry,
      alwaysIncludeFullContent: membershipModel.alwaysIncludeFullContent,
      updatedAt: membershipModel.updatedAt,
    })
  }
}
