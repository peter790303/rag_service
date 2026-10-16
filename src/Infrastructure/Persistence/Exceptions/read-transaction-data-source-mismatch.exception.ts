export class ReadTransactionDataSourceMismatchException extends Error {
  readonly code = 'READ_TRANSACTION_DATA_SOURCE_MISMATCH'

  constructor() {
    super('Chunk candidate queries require the retrieval DataSource')
    this.name = 'ReadTransactionDataSourceMismatchException'
  }
}
