import type { Membership } from '../../../Domain/Membership/membership.ts'

export abstract class SaveMembershipIndexRequestUseCaseContract {
  abstract execute(saveMembershipIndexRequestDTO: {
    membership: Membership
    generation: string
    activeDocumentIndexId: string | null
  }): Promise<void>
}
