import type { KnowledgeBaseDocumentPruningStartedEvent } from '../Events/knowledge-base-document-pruning-started.event.ts'

/** Synchronously delivers the fact that a locked knowledgeBaseDocument has entered pruning. */
export abstract class KnowledgeBaseDocumentPruningEventDelivery {
  abstract deliver(event: KnowledgeBaseDocumentPruningStartedEvent): Promise<readonly string[]>
}
