export interface MembershipSourceQueryObject {
  readonly knowledgeBaseId: string
  readonly documentId: string
}

export interface MembershipActiveIndexQueryObject {
  readonly documentIndexId: string
}

export interface MembershipKnowledgeBaseQueryObject {
  readonly knowledgeBaseId: string
}

export interface MembershipDocumentQueryObject {
  readonly documentId: string
}

export interface MembershipActivationQueryObject extends MembershipSourceQueryObject {
  readonly requestedGeneration: string
  readonly expectedActiveDocumentIndexId: string | null
  readonly documentIndexId: string
  readonly updatedAt: Date
}

export interface InsertMembershipQueryObject extends MembershipSourceQueryObject {
  readonly isEntry: boolean
  readonly alwaysIncludeFullContent: boolean
  readonly activeDocumentIndexId: string | null
  readonly requestedGeneration: string
  readonly updatedAt: Date
}

export interface UpdateMembershipQueryObject extends MembershipSourceQueryObject {
  readonly isEntry: boolean
  readonly alwaysIncludeFullContent: boolean
  readonly activeDocumentIndexId: string | null
  readonly requestedGeneration: string
  readonly updatedAt: Date
}

export interface UpdateMembershipActiveIndexQueryObject extends MembershipSourceQueryObject {
  readonly activeDocumentIndexId: string | null
  readonly updatedAt: Date
}

export interface SaveMembershipRequestQueryObject extends MembershipSourceQueryObject {
  readonly isEntry: boolean
  readonly alwaysIncludeFullContent: boolean
  readonly activeDocumentIndexId: string | null
  readonly requestedGeneration: string
  readonly updatedAt: Date
}
