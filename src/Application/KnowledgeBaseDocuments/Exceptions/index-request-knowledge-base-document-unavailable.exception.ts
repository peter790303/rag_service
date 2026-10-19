export class IndexRequestKnowledgeBaseDocumentUnavailableException extends Error {
  readonly code = 'INDEX_REQUEST_MEMBERSHIP_UNAVAILABLE'

  constructor() {
    super('Membership is no longer available')
    this.name = 'IndexRequestKnowledgeBaseDocumentUnavailableException'
  }
}
