export class UnsupportedDocumentIndexExecutionStatusException extends Error {
  readonly code = 'UNSUPPORTED_JOB_STATUS'

  constructor(readonly context: { status: string }) {
    super(`Unsupported RAG job status: ${context.status}`)
    this.name = 'UnsupportedDocumentIndexExecutionStatusException'
  }
}
