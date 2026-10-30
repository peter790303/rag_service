import { KnowledgeRetrievalIncompleteException } from './knowledge-retrieval-incomplete.exception.ts'

export class RetrievalRevisionIdentityMissingException extends KnowledgeRetrievalIncompleteException {
  constructor(readonly context: { revisionId: string }) {
    super()
    this.message = `Retrieval snapshot is missing revision content identity for ${context.revisionId}`
    this.name = 'RetrievalRevisionIdentityMissingException'
  }
}
