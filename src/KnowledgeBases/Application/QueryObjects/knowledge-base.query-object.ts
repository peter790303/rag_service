export interface KnowledgeBaseIdQO {
  readonly knowledgeBaseId: string
}

export interface KnowledgeBaseProjectQO {
  readonly projectId: string
}

export interface KnowledgeBaseProjectScopeQO extends KnowledgeBaseIdQO {
  readonly projectId: string
}

export interface CreateKnowledgeBaseQO {
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly knowledgeBaseId: string
  readonly projectId: string
  readonly projectName: string
}

export interface UpdateKnowledgeBaseQO {
  readonly updatedAt: Date
  readonly knowledgeBaseId: string
  readonly projectId: string
  readonly projectName: string
}
