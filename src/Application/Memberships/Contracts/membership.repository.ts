import type { Membership } from '../../../Domain/Membership/membership.ts'
import type { MembershipActivationQueryObject } from '../QueryObjects/membership.query-object.ts'
import type { MembershipActiveIndexQueryObject } from '../QueryObjects/membership.query-object.ts'
import type { MembershipDocumentQueryObject } from '../QueryObjects/membership.query-object.ts'
import type { MembershipKnowledgeBaseQueryObject } from '../QueryObjects/membership.query-object.ts'
import type { MembershipSourceQueryObject } from '../QueryObjects/membership.query-object.ts'
import type {
  InsertMembershipQueryObject,
  UpdateMembershipQueryObject,
  UpdateMembershipActiveIndexQueryObject,
  SaveMembershipRequestQueryObject,
} from '../QueryObjects/membership.query-object.ts'

export abstract class MembershipRepository {
  abstract findByKnowledgeBaseIdAndDocumentId(
    membershipSourceQO: MembershipSourceQueryObject,
  ): Promise<Membership | null>

  abstract lockByKnowledgeBaseIdAndDocumentId(
    membershipSourceQO: MembershipSourceQueryObject,
  ): Promise<Membership | null>

  abstract lockByKnowledgeBaseIdAndDocumentIdSkipLocked(
    membershipSourceQO: MembershipSourceQueryObject,
  ): Promise<Membership | null>

  abstract insert(insertMembershipQO: InsertMembershipQueryObject): Promise<void>

  abstract updateByKnowledgeBaseIdAndDocumentId(updateMembershipQO: UpdateMembershipQueryObject): Promise<void>

  abstract updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentId(
    updateMembershipActiveIndexQO: UpdateMembershipActiveIndexQueryObject,
  ): Promise<void>

  abstract removeByKnowledgeBaseIdAndDocumentId(membershipSourceQO: MembershipSourceQueryObject): Promise<void>

  abstract updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId(
    membershipActivationQO: MembershipActivationQueryObject,
  ): Promise<Membership | null>

  abstract saveRequest(saveMembershipRequestQO: SaveMembershipRequestQueryObject): Promise<Membership>

  abstract findByActiveDocumentIndexId(
    membershipActiveIndexQO: MembershipActiveIndexQueryObject,
  ): Promise<Membership | null>

  abstract findByKnowledgeBaseIdOrderByDocumentIdAsc(
    membershipKnowledgeBaseQO: MembershipKnowledgeBaseQueryObject,
  ): Promise<Membership[]>

  abstract findByDocumentId(membershipDocumentQO: MembershipDocumentQueryObject): Promise<Membership | null>
}
