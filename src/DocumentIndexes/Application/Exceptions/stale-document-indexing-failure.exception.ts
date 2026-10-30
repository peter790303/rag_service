export class StaleDocumentIndexingFailureException extends Error {
  readonly code = 'STALE_DOCUMENT_INDEXING_FAILURE'

  constructor() {
    super('Failed job is stale and cannot be manually retried')
    this.name = 'StaleDocumentIndexingFailureException'
  }
}
