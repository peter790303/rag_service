export class KnowledgeJobNotFoundException extends Error {
  readonly code = 'KNOWLEDGE_JOB_NOT_FOUND'

  constructor(id: string) {
    super(`Knowledge job ${id} was not found`)
    this.name = 'KnowledgeJobNotFoundException'
  }
}
