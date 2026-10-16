import { KnowledgeRetrievalIncompleteException } from './knowledge-retrieval-incomplete.exception.ts'

export class RetrievalRelationResolutionMissingException extends KnowledgeRetrievalIncompleteException {
  constructor(readonly context: { relationId: string }) {
    super()
    this.message = `Retrieval result is missing resolution for relation ${context.relationId}`
    this.name = 'RetrievalRelationResolutionMissingException'
  }
}
