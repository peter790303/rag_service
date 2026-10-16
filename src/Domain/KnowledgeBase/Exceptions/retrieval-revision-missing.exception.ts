import { KnowledgeRetrievalIncompleteException } from './knowledge-retrieval-incomplete.exception.ts'

export class RetrievalRevisionMissingException extends KnowledgeRetrievalIncompleteException {
  constructor(readonly context: { revisionId: string }) {
    super()
    this.message = `Retrieval snapshot is missing revision ${context.revisionId}`
    this.name = 'RetrievalRevisionMissingException'
  }
}
