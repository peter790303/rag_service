export class ChunkIdentityRequiredException extends Error {
  readonly code = 'CHUNK_IDENTITY_REQUIRED'

  constructor() {
    super('Chunk id must be non-empty')
    this.name = 'ChunkIdentityRequiredException'
  }
}
