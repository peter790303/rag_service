import type {
  MembershipDocumentQueryObject,
  MembershipActiveIndexQueryObject,
} from '../QueryObjects/membership.query-object.ts'

export class RetentionMembershipAssembler {
  static toMembershipDocumentQO(documentId: string): MembershipDocumentQueryObject {
    return { documentId }
  }

  static toMembershipActiveIndexQO(documentIndexId: string): MembershipActiveIndexQueryObject {
    return { documentIndexId }
  }
}
