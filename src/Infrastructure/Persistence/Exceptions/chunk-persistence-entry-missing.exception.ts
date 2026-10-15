export class ChunkPersistenceEntryMissingException extends Error {
  readonly code = 'CHUNK_PERSISTENCE_ENTRY_MISSING'

  constructor(readonly context: { ordinal: number }) {
    super('Chunk persistence inputs must contain every planned chunk')
    this.name = 'ChunkPersistenceEntryMissingException'
  }
}
