export class IndexDisappearedBeforeCompletionException extends Error {
  readonly code = 'INDEX_DISAPPEARED_BEFORE_COMPLETION'

  constructor() {
    super('Index disappeared before completion')
    this.name = 'IndexDisappearedBeforeCompletionException'
  }
}
