import { KnowledgeRetrievalIncompleteException } from './knowledge-retrieval-incomplete.exception.ts'

export class RetrievalExactChunkCountMissingException extends KnowledgeRetrievalIncompleteException {
  constructor(readonly context: { indexId: string }) {
    super()
    this.message = `Retrieval snapshot is missing an exact chunk count for index ${context.indexId}`
    this.name = 'RetrievalExactChunkCountMissingException'
  }
}
