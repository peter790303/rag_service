import { KnowledgeRetrievalIncompleteException } from './knowledge-retrieval-incomplete.exception.ts'

export class RetrievalDocumentMissingException extends KnowledgeRetrievalIncompleteException {
  constructor(readonly context: { documentId: string }) {
    super()
    this.message = `Retrieval snapshot is missing document ${context.documentId}`
    this.name = 'RetrievalDocumentMissingException'
  }
}
