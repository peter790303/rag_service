import { KnowledgeRetrievalIncompleteException } from './knowledge-retrieval-incomplete.exception.ts'

export class RequiredDocumentFullContentMissingException extends KnowledgeRetrievalIncompleteException {
  constructor(readonly context: { documentId: string }) {
    super()
    this.message = `Retrieval snapshot is missing required full-content facts for document ${context.documentId}`
    this.name = 'RequiredDocumentFullContentMissingException'
  }
}
