import { KnowledgeRetrievalIncompleteException } from './knowledge-retrieval-incomplete.exception.ts'

export class RetrievalRelationSourceDocumentMissingException extends KnowledgeRetrievalIncompleteException {
  constructor(readonly context: { relationId: string }) {
    super()
    this.message = `Retrieval snapshot is missing source document for relation ${context.relationId}`
    this.name = 'RetrievalRelationSourceDocumentMissingException'
  }
}
