export class InvalidRetrievalChunkContextInputException extends Error {
  readonly code = 'INVALID_RETRIEVAL_CHUNK_CONTEXT_INPUT'

  constructor(readonly field: string) {
    super(`Retrieval chunk context input must provide a valid ${field}.`)
    this.name = 'InvalidRetrievalChunkContextInputException'
  }
}
