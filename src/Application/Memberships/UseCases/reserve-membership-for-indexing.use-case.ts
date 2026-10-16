import type { Membership } from '../../../Domain/Membership/membership.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../DocumentIndexes/Exceptions/invalid-document-index-execution-lease.exception.ts'
import type { MembershipRepository } from '../Contracts/membership.repository.ts'
import type { ReserveMembershipForIndexingUseCaseContract } from '../Contracts/reserve-membership-for-indexing.use-case.contract.ts'

/** Fences a lease by requested generation and distinguishes contention from detached membership. */
export class ReserveMembershipForIndexingUseCase implements ReserveMembershipForIndexingUseCaseContract {
  constructor(private readonly membershipRepository: MembershipRepository) {}

  async execute(reserveMembershipForIndexingDTO: {
    knowledgeBaseId: string
    documentId: string
    skipLocked?: boolean
    generation?: string
  }): Promise<Membership | null> {
    const membershipSourceQO = {
      knowledgeBaseId: reserveMembershipForIndexingDTO.knowledgeBaseId,
      documentId: reserveMembershipForIndexingDTO.documentId,
    }
    const membership = reserveMembershipForIndexingDTO.skipLocked
      ? await this.membershipRepository.lockByKnowledgeBaseIdAndDocumentIdSkipLocked(membershipSourceQO)
      : await this.membershipRepository.lockByKnowledgeBaseIdAndDocumentId(membershipSourceQO)

    if (reserveMembershipForIndexingDTO.skipLocked && membership === null) {
      const contendedMembership = await this.membershipRepository.findByKnowledgeBaseIdAndDocumentId(membershipSourceQO)

      if (contendedMembership !== null) {
        contendedMembership.recordIndexingReservationLock(false)

        return contendedMembership
      }
    }

    if (
      reserveMembershipForIndexingDTO.generation !== undefined &&
      membership?.requestedGeneration !== reserveMembershipForIndexingDTO.generation
    ) {
      throw new InvalidDocumentIndexExecutionLeaseException()
    }

    membership?.recordIndexingReservationLock(true)

    return membership
  }
}
