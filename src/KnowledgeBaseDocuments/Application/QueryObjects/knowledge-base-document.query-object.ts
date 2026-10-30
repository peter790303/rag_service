export interface KnowledgeBaseDocumentSourceQO {
  readonly knowledgeBaseId: string
  readonly documentId: string
}

export interface KnowledgeBaseDocumentActiveIndexQO {
  readonly documentIndexId: string
}

export interface KnowledgeBaseDocumentKnowledgeBaseQO {
  readonly knowledgeBaseId: string
}

export interface KnowledgeBaseDocumentDocumentQO {
  readonly documentId: string
}

export interface KnowledgeBaseDocumentActivationQO extends KnowledgeBaseDocumentSourceQO {
  readonly requestedGeneration: string
  readonly expectedActiveDocumentIndexId: string | null
  readonly documentIndexId: string
  readonly updatedAt: Date
}

export interface InsertKnowledgeBaseDocumentQO extends KnowledgeBaseDocumentSourceQO {
  readonly isEntry: boolean
  readonly alwaysIncludeFullContent: boolean
  readonly activeDocumentIndexId: string | null
  readonly requestedGeneration: string
  readonly updatedAt: Date
}

export interface UpdateKnowledgeBaseDocumentQO extends KnowledgeBaseDocumentSourceQO {
  readonly isEntry: boolean
  readonly alwaysIncludeFullContent: boolean
  readonly activeDocumentIndexId: string | null
  readonly requestedGeneration: string
  readonly updatedAt: Date
}

export interface UpdateKnowledgeBaseDocumentActiveIndexQO extends KnowledgeBaseDocumentSourceQO {
  readonly activeDocumentIndexId: string | null
  readonly updatedAt: Date
}

export interface UpdateKnowledgeBaseDocumentRequestQO extends KnowledgeBaseDocumentSourceQO {
  readonly isEntry: boolean
  readonly alwaysIncludeFullContent: boolean
  readonly activeDocumentIndexId: string | null
  readonly requestedGeneration: string
  readonly updatedAt: Date
}
