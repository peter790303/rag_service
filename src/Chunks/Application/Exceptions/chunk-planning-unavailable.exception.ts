export class ChunkPlanningUnavailableException extends Error {
  readonly code = 'CHUNK_PLANNING_UNAVAILABLE'

  constructor(options?: ErrorOptions) {
    super('Semantic chunk planning is unavailable', options)
    this.name = 'ChunkPlanningUnavailableException'
  }
}
