export class InvalidIndexPipelineInputException extends Error {
  readonly code = 'INVALID_INDEX_PIPELINE_INPUT'

  constructor() {
    super('RAG pipeline hash input could not be serialized')
    this.name = 'InvalidIndexPipelineInputException'
  }
}
