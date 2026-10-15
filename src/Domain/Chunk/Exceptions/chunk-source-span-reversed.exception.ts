export class ChunkSourceSpanReversedException extends Error {
  readonly code = 'CHUNK_SOURCE_SPAN_REVERSED'

  constructor() {
    super('Chunk source block end must not precede its start')
    this.name = 'ChunkSourceSpanReversedException'
  }
}
