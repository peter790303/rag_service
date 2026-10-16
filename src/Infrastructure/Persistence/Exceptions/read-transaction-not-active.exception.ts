export class ReadTransactionNotActiveException extends Error {
  readonly code = 'READ_TRANSACTION_NOT_ACTIVE'

  constructor() {
    super('Chunk candidate queries require an active read transaction')
    this.name = 'ReadTransactionNotActiveException'
  }
}
