import type { Membership } from '../../../Domain/Membership/membership.ts'

export abstract class ActivateMembershipIndexUseCaseContract {
  abstract execute(activateMembershipIndexDTO: {
    knowledgeBaseId: string
    documentId: string
    generation: string
    expectedActiveDocumentIndexId: string | null
    documentIndexId: string
  }): Promise<Membership | null>
}
