import { KnowledgeRetrievalIncompleteException } from './knowledge-retrieval-incomplete.exception.ts'

export class RequiredDocumentActiveIndexMissingException extends KnowledgeRetrievalIncompleteException {
  constructor(readonly context: { documentId: string }) {
    super()
    this.message = `Retrieval snapshot is missing an active index for required document ${context.documentId}`
    this.name = 'RequiredDocumentActiveIndexMissingException'
  }
}
