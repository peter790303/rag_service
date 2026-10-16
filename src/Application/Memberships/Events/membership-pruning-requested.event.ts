/** Pruning has been requested for one locked membership. */
export class MembershipPruningRequestedEvent {
  constructor(
    readonly knowledgeBaseId: string,
    readonly documentId: string,
  ) {}
}
