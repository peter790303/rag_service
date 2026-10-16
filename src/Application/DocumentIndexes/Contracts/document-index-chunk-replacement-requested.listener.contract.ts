import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { DocumentIndexChunkReplacementRequestedEvent } from '../Events/document-index-chunk-replacement-requested.event.ts'

/** Authorizes replacing a claimed index plan while holding its lifecycle locks. */
export abstract class DocumentIndexChunkReplacementRequestedListenerContract {
  abstract handle(event: DocumentIndexChunkReplacementRequestedEvent): Promise<DocumentIndex | null>
}
