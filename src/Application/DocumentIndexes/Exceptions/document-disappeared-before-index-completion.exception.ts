export class DocumentDisappearedBeforeIndexCompletionException extends Error {
  readonly code = 'DOCUMENT_DISAPPEARED_BEFORE_INDEX_COMPLETION'

  constructor() {
    super('Document disappeared before completion')
    this.name = 'DocumentDisappearedBeforeIndexCompletionException'
  }
}
