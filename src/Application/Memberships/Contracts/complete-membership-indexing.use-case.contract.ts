import type { Membership } from '../../../Domain/Membership/membership.ts'

export abstract class CompleteMembershipIndexingUseCaseContract {
  abstract execute(completeMembershipIndexingDTO: {
    membership: Membership
    generation: string
    documentIndexId: string
  }): Promise<void>
}
