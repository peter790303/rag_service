import { KnowledgeRetrievalIncompleteException } from './knowledge-retrieval-incomplete.exception.ts'

export class RetrievalReadyIndexMissingException extends KnowledgeRetrievalIncompleteException {
  constructor(readonly context: { indexId: string }) {
    super()
    this.message = `Retrieval snapshot is missing a ready index ${context.indexId}`
    this.name = 'RetrievalReadyIndexMissingException'
  }
}
