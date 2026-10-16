export class DocumentIndexingFailureAlreadyRetriedException extends Error {
  readonly code = 'DOCUMENT_INDEXING_FAILURE_ALREADY_RETRIED'

  constructor() {
    super('Failed job has already been retried')
    this.name = 'DocumentIndexingFailureAlreadyRetriedException'
  }
}
