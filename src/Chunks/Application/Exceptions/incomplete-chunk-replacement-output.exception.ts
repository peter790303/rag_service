export class IncompleteChunkReplacementOutputException extends Error {
  readonly code = 'INCOMPLETE_CHUNK_REPLACEMENT_OUTPUT'

  constructor(readonly context: { ordinal: number }) {
    super('Replacement output is incomplete')
    this.name = 'IncompleteChunkReplacementOutputException'
  }
}
