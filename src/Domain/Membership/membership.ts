import { InvalidMembershipIndexGenerationException } from './Exceptions/invalid-membership-index-generation.exception.ts'
import { InvalidMembershipStateException } from './Exceptions/invalid-membership-state.exception.ts'
import { MembershipReservationEvidenceUnavailableException } from './Exceptions/membership-reservation-evidence-unavailable.exception.ts'
import { InvalidDateTimeException } from '../Document/Exceptions/invalid-date-time.exception.ts'
import { DateTime } from '../Document/ValueObjects/date-time.ts'

export interface MembershipState {
  readonly knowledgeBaseId: string
  readonly documentId: string
  readonly requestedGeneration: string
  readonly activeDocumentIndexId: string | null
  readonly isEntry: boolean
  readonly alwaysIncludeFullContent: boolean
  readonly updatedAt: Date | DateTime
}

export class Membership {
  readonly knowledgeBaseId: string

  readonly documentId: string

  readonly requestedGeneration: string

  readonly activeDocumentIndexId: string | null

  readonly isEntry: boolean

  readonly alwaysIncludeFullContent: boolean

  private readonly updatedAtValue: DateTime

  private reservationLockAcquired: boolean | undefined

  constructor(membershipState: MembershipState) {
    if (typeof membershipState.knowledgeBaseId !== 'string' || !membershipState.knowledgeBaseId.trim())
      throw new InvalidMembershipStateException('knowledgeBaseId')

    if (typeof membershipState.documentId !== 'string' || !membershipState.documentId.trim())
      throw new InvalidMembershipStateException('documentId')

    if (
      typeof membershipState.requestedGeneration !== 'string' ||
      !/^(0|[1-9]\d*)$/.test(membershipState.requestedGeneration)
    )
      throw new InvalidMembershipStateException('requestedGeneration')

    if (
      membershipState.activeDocumentIndexId !== null &&
      (typeof membershipState.activeDocumentIndexId !== 'string' || !membershipState.activeDocumentIndexId.trim())
    )
      throw new InvalidMembershipStateException('activeDocumentIndexId')

    if (typeof membershipState.isEntry !== 'boolean') throw new InvalidMembershipStateException('isEntry')

    if (typeof membershipState.alwaysIncludeFullContent !== 'boolean')
      throw new InvalidMembershipStateException('alwaysIncludeFullContent')

    this.updatedAtValue = this.toDateTime(membershipState.updatedAt)

    this.knowledgeBaseId = membershipState.knowledgeBaseId
    this.documentId = membershipState.documentId
    this.requestedGeneration = membershipState.requestedGeneration
    this.activeDocumentIndexId = membershipState.activeDocumentIndexId
    this.isEntry = membershipState.isEntry
    this.alwaysIncludeFullContent = membershipState.alwaysIncludeFullContent
  }

  get updatedAt(): DateTime {
    return this.updatedAtValue
  }

  /** Evidence belongs only to this reservation attempt; it does not promise future row existence. */
  get indexingReservationLockAcquired(): boolean {
    if (this.reservationLockAcquired === undefined) throw new MembershipReservationEvidenceUnavailableException()

    return this.reservationLockAcquired
  }

  recordIndexingReservationLock(acquired: boolean): void {
    this.reservationLockAcquired = acquired
  }

  configure(
    options: { isEntry?: boolean; alwaysIncludeFullContent?: boolean },
    updatedAt: Date | DateTime,
  ): Membership {
    return this.withState({
      isEntry: options.isEntry === undefined ? this.isEntry : options.isEntry,
      alwaysIncludeFullContent:
        options.alwaysIncludeFullContent === undefined
          ? this.alwaysIncludeFullContent
          : options.alwaysIncludeFullContent,
      updatedAt,
    })
  }

  requestIndex(
    indexRequest: { generation: string; activeDocumentIndexId: string | null },
    updatedAt: Date | DateTime = this.updatedAt,
  ): Membership {
    if (typeof indexRequest.generation !== 'string' || !/^(0|[1-9]\d*)$/.test(indexRequest.generation))
      throw new InvalidMembershipStateException('requestedGeneration')

    const currentGeneration = BigInt(this.requestedGeneration)
    const requestedGeneration = BigInt(indexRequest.generation)

    if (requestedGeneration < currentGeneration || requestedGeneration > currentGeneration + 1n)
      throw new InvalidMembershipIndexGenerationException({
        currentGeneration: this.requestedGeneration,
        requestedGeneration: indexRequest.generation,
      })

    return this.withState({
      requestedGeneration: indexRequest.generation,
      activeDocumentIndexId: indexRequest.activeDocumentIndexId,
      updatedAt,
    })
  }

  activateIndex(documentIndexId: string, updatedAt: Date | DateTime): Membership {
    return this.withState({ activeDocumentIndexId: documentIndexId, updatedAt })
  }

  detachIndex(updatedAt: Date | DateTime): Membership {
    return this.withState({ activeDocumentIndexId: null, updatedAt })
  }

  private withState(changes: Partial<MembershipState>): Membership {
    return new Membership({
      knowledgeBaseId: this.knowledgeBaseId,
      documentId: this.documentId,
      requestedGeneration: this.requestedGeneration,
      activeDocumentIndexId: this.activeDocumentIndexId,
      isEntry: this.isEntry,
      alwaysIncludeFullContent: this.alwaysIncludeFullContent,
      updatedAt: this.updatedAt,
      ...changes,
    })
  }

  private toDateTime(value: Date | DateTime): DateTime {
    try {
      return new DateTime(value)
    } catch (error) {
      if (!(error instanceof InvalidDateTimeException)) throw error

      throw new InvalidMembershipStateException('updatedAt')
    }
  }
}
