export class InvalidIndexChunkGarbageInputException extends Error {
  readonly code = 'INVALID_INDEX_CHUNK_GARBAGE_INPUT'

  constructor(readonly field: string) {
    super(`Chunk garbage collection requires a valid ${field}`)
    this.name = 'InvalidIndexChunkGarbageInputException'
  }
}
