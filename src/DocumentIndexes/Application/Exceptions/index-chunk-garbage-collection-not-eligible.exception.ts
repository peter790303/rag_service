export class IndexChunkGarbageCollectionNotEligibleException extends Error {
  readonly code = 'INDEX_CHUNK_GARBAGE_COLLECTION_NOT_ELIGIBLE'

  constructor() {
    super('Chunk garbage collection requires an expired unreferenced index')
    this.name = 'IndexChunkGarbageCollectionNotEligibleException'
  }
}
