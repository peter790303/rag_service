/** A locked knowledgeBaseDocument has entered pruning and its indexing work must be detached. */
export class KnowledgeBaseDocumentPruningStartedEvent {
  constructor(
    readonly knowledgeBaseId: string,
    readonly documentId: string,
  ) {}
}
