export interface KnowledgeBaseDocumentSourceQueryObject {
  readonly knowledgeBaseId: string
  readonly documentId: string
}

export interface KnowledgeBaseDocumentActiveIndexQueryObject {
  readonly documentIndexId: string
}

export interface KnowledgeBaseDocumentKnowledgeBaseQueryObject {
  readonly knowledgeBaseId: string
}

export interface KnowledgeBaseDocumentDocumentQueryObject {
  readonly documentId: string
}

export interface KnowledgeBaseDocumentActivationQueryObject extends KnowledgeBaseDocumentSourceQueryObject {
  readonly requestedGeneration: string
  readonly expectedActiveDocumentIndexId: string | null
  readonly documentIndexId: string
  readonly updatedAt: Date
}

export interface InsertKnowledgeBaseDocumentQueryObject extends KnowledgeBaseDocumentSourceQueryObject {
  readonly isEntry: boolean
  readonly alwaysIncludeFullContent: boolean
  readonly activeDocumentIndexId: string | null
  readonly requestedGeneration: string
  readonly updatedAt: Date
}

export interface UpdateKnowledgeBaseDocumentQueryObject extends KnowledgeBaseDocumentSourceQueryObject {
  readonly isEntry: boolean
  readonly alwaysIncludeFullContent: boolean
  readonly activeDocumentIndexId: string | null
  readonly requestedGeneration: string
  readonly updatedAt: Date
}

export interface UpdateKnowledgeBaseDocumentActiveIndexQueryObject extends KnowledgeBaseDocumentSourceQueryObject {
  readonly activeDocumentIndexId: string | null
  readonly updatedAt: Date
}

export interface UpdateKnowledgeBaseDocumentRequestQueryObject extends KnowledgeBaseDocumentSourceQueryObject {
  readonly isEntry: boolean
  readonly alwaysIncludeFullContent: boolean
  readonly activeDocumentIndexId: string | null
  readonly requestedGeneration: string
  readonly updatedAt: Date
}
