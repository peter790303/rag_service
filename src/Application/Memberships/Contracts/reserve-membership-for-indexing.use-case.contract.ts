import type { Membership } from '../../../Domain/Membership/membership.ts'

export abstract class ReserveMembershipForIndexingUseCaseContract {
  abstract execute(reserveMembershipForIndexingDTO: {
    knowledgeBaseId: string
    documentId: string
    skipLocked?: boolean
    generation?: string
  }): Promise<Membership | null>
}
