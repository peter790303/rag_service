export class ChunkPlanningUnavailableException extends Error {
  readonly code = 'CHUNK_PLANNING_UNAVAILABLE'

  constructor() {
    super('Semantic chunk planning is unavailable')
    this.name = 'ChunkPlanningUnavailableException'
  }
}
