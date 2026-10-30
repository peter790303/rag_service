/** Document retention collection has been requested. */
export class DocumentGarbageCollectionRequestedEvent {
  readonly requestedAt: Date

  constructor(requestedAt: Date = new Date()) {
    this.requestedAt = new Date(requestedAt)
  }
}
