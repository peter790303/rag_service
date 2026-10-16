import type { Membership } from '../../../Domain/Membership/membership.ts'
import type { LoadRetrievalMembershipsDto } from '../DataTransferObjects/load-retrieval-memberships.dto.ts'

export abstract class LoadRetrievalMembershipsUseCaseContract {
  abstract execute(loadRetrievalMembershipsDTO: LoadRetrievalMembershipsDto): Promise<Membership[]>
}
