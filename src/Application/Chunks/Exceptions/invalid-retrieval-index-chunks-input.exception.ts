export class InvalidRetrievalIndexChunksInputException extends Error {
  readonly code = 'INVALID_RETRIEVAL_INDEX_CHUNKS_INPUT'

  constructor(readonly field: string) {
    super(`Retrieval index chunks input must provide a valid ${field}.`)
    this.name = 'InvalidRetrievalIndexChunksInputException'
  }
}
