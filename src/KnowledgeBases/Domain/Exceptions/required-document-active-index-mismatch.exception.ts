import { KnowledgeRetrievalIncompleteException } from './knowledge-retrieval-incomplete.exception.ts'

export class RequiredDocumentActiveIndexMismatchException extends KnowledgeRetrievalIncompleteException {
  constructor(readonly context: { indexId: string; documentId: string }) {
    super()
    this.message = `Retrieval snapshot active index ${context.indexId} does not belong to required document ${context.documentId}`
    this.name = 'RequiredDocumentActiveIndexMismatchException'
  }
}
