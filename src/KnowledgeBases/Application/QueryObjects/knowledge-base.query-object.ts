export interface KnowledgeBaseIdQueryObject {
  readonly knowledgeBaseId: string
}

export interface KnowledgeBaseProjectQueryObject {
  readonly projectId: string
}

export interface KnowledgeBaseProjectScopeQueryObject extends KnowledgeBaseIdQueryObject {
  readonly projectId: string
}

export interface CreateKnowledgeBaseQueryObject {
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly knowledgeBaseId: string
  readonly projectId: string
  readonly projectName: string
}

export interface UpdateKnowledgeBaseQueryObject {
  readonly updatedAt: Date
  readonly knowledgeBaseId: string
  readonly projectId: string
  readonly projectName: string
}
