import { KnowledgeRetrievalIncompleteException } from './knowledge-retrieval-incomplete.exception.ts'

export class RetrievalRelationSourceIndexMissingException extends KnowledgeRetrievalIncompleteException {
  constructor(readonly context: { relationId: string }) {
    super()
    this.message = `Retrieval snapshot is missing source index for relation ${context.relationId}`
    this.name = 'RetrievalRelationSourceIndexMissingException'
  }
}
