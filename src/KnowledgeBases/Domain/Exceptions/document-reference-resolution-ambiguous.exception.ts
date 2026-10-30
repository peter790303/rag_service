import { KnowledgeRetrievalIncompleteException } from './knowledge-retrieval-incomplete.exception.ts'

export class DocumentReferenceResolutionAmbiguousException extends KnowledgeRetrievalIncompleteException {
  constructor(readonly context: { matchingDocumentCount: number }) {
    super()
    this.message = 'Document reference must identify exactly one project document'
    this.name = 'DocumentReferenceResolutionAmbiguousException'
  }
}
