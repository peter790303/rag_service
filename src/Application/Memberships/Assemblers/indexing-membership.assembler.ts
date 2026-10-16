import type { Membership } from '../../../Domain/Membership/membership.ts'
import type {
  InsertMembershipQueryObject,
  UpdateMembershipQueryObject,
  MembershipActivationQueryObject,
} from '../QueryObjects/membership.query-object.ts'

export class IndexingMembershipAssembler {
  static toMembershipActivationQO(
    membership: Membership,
    expectedActiveDocumentIndexId: string | null,
    documentIndexId: string,
  ): MembershipActivationQueryObject {
    return {
      knowledgeBaseId: membership.knowledgeBaseId,
      documentId: membership.documentId,
      requestedGeneration: membership.requestedGeneration,
      expectedActiveDocumentIndexId,
      documentIndexId,
      updatedAt: membership.updatedAt.nativeDate,
    }
  }

  static toInsertMembershipQO(membership: Membership): InsertMembershipQueryObject {
    return {
      knowledgeBaseId: membership.knowledgeBaseId,
      documentId: membership.documentId,
      requestedGeneration: membership.requestedGeneration,
      activeDocumentIndexId: membership.activeDocumentIndexId,
      isEntry: membership.isEntry,
      alwaysIncludeFullContent: membership.alwaysIncludeFullContent,
      updatedAt: membership.updatedAt.nativeDate,
    }
  }

  static toUpdateMembershipQO(membership: Membership): UpdateMembershipQueryObject {
    return {
      knowledgeBaseId: membership.knowledgeBaseId,
      documentId: membership.documentId,
      requestedGeneration: membership.requestedGeneration,
      activeDocumentIndexId: membership.activeDocumentIndexId,
      isEntry: membership.isEntry,
      alwaysIncludeFullContent: membership.alwaysIncludeFullContent,
      updatedAt: membership.updatedAt.nativeDate,
    }
  }
}
