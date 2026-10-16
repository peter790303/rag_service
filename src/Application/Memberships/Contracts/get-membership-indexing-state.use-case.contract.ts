import type { Membership } from '../../../Domain/Membership/membership.ts'

export abstract class GetMembershipIndexingStateUseCaseContract {
  abstract execute(getMembershipIndexingStateDTO: {
    knowledgeBaseId: string
    documentId: string
  }): Promise<Membership | null>
}
