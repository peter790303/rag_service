import type { Membership } from '../../../Domain/Membership/membership.ts'
import type { MembershipRetentionDto } from '../DataTransferObjects/membership-retention.dto.ts'

export abstract class InspectMembershipRetentionUseCaseContract {
  abstract execute(inspectMembershipRetentionDTO: MembershipRetentionDto): Promise<Membership | null>
}
