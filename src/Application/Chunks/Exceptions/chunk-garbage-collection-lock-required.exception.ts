export class ChunkGarbageCollectionLockRequiredException extends Error {
  readonly code = 'CHUNK_GARBAGE_COLLECTION_LOCK_REQUIRED'

  constructor() {
    super('Chunk garbage collection requires its document parent lock')
    this.name = 'ChunkGarbageCollectionLockRequiredException'
  }
}
