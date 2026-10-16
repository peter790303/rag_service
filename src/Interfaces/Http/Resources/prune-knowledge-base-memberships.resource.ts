import type { Membership } from '../../../Domain/Membership/membership.ts'

export class PruneKnowledgeBaseMembershipsResource {
  static toPruneKnowledgeBaseMembershipsResource(memberships: readonly Membership[]): { pruned: number } {
    return { pruned: memberships.length }
  }
}
