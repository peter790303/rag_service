import type { Membership } from '../../../Domain/Membership/membership.ts'
import { RetentionMembershipAssembler } from '../Assemblers/retention-membership.assembler.ts'
import type { InspectMembershipRetentionUseCaseContract } from '../Contracts/inspect-membership-retention.use-case.contract.ts'
import type { MembershipRepository } from '../Contracts/membership.repository.ts'
import type { MembershipRetentionDto } from '../DataTransferObjects/membership-retention.dto.ts'

export class InspectMembershipRetentionUseCase implements InspectMembershipRetentionUseCaseContract {
  constructor(private readonly membershipRepository: MembershipRepository) {}

  async execute(inspectMembershipRetentionDTO: MembershipRetentionDto): Promise<Membership | null> {
    const referencingMembership =
      'documentId' in inspectMembershipRetentionDTO
        ? await this.membershipRepository.findByDocumentId(
            RetentionMembershipAssembler.toMembershipDocumentQO(inspectMembershipRetentionDTO.documentId),
          )
        : await this.membershipRepository.findByActiveDocumentIndexId(
            RetentionMembershipAssembler.toMembershipActiveIndexQO(inspectMembershipRetentionDTO.documentIndexId),
          )

    return referencingMembership
  }
}
