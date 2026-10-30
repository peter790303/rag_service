import { DocumentIndexExecutionClaimLimitReachedException } from '../Exceptions/document-index-execution-claim-limit-reached.exception.ts'
import { DocumentIndexExecutionClaimRequiresQueuedStateException } from '../Exceptions/document-index-execution-claim-requires-queued-state.exception.ts'
import { DocumentIndexExecutionIdentityRequiredException } from '../Exceptions/document-index-execution-identity-required.exception.ts'
import { InvalidDocumentIndexExecutionAttemptCountException } from '../Exceptions/invalid-document-index-execution-attempt-count.exception.ts'
import { InvalidDocumentIndexExecutionLeaseDurationException } from '../Exceptions/invalid-document-index-execution-lease-duration.exception.ts'
import { InvalidDocumentIndexExecutionTimestampException } from '../Exceptions/invalid-document-index-execution-timestamp.exception.ts'
import { UnsupportedDocumentIndexExecutionStatusException } from '../Exceptions/unsupported-document-index-execution-status.exception.ts'

export const DOCUMENT_INDEX_EXECUTION_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
} as const

export type DocumentIndexExecutionStatus =
  (typeof DOCUMENT_INDEX_EXECUTION_STATUS)[keyof typeof DOCUMENT_INDEX_EXECUTION_STATUS]

type DocumentIndexExecutionState = {
  id: string
  status: DocumentIndexExecutionStatus
  attempts: number
  leaseExpiresAt: Date | null
}

type DocumentIndexExecutionFailure = {
  errorMessage: string
  terminalErrorMessage?: string
  failedAt: Date
}

type DocumentIndexExecutionFailureTransition =
  { terminal: true; errorMessage: string; retryAt: null } | { terminal: false; errorMessage: string; retryAt: Date }

const MAX_ATTEMPTS = 4
const MAX_RETRY_DELAY_MS = 60_000

/** Validates the technical attempt, retry and lease state of an index job. */
export class DocumentIndexExecutionLifecycle {
  readonly id: string

  readonly status: DocumentIndexExecutionStatus

  readonly attempts: number

  private readonly leaseExpiry: Date | null

  constructor(state: DocumentIndexExecutionState) {
    if (typeof state.id !== 'string' || !state.id.trim()) throw new DocumentIndexExecutionIdentityRequiredException()

    if (
      state.status !== DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED &&
      state.status !== DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING
    ) {
      throw new UnsupportedDocumentIndexExecutionStatusException({ status: state.status })
    }

    if (!Number.isSafeInteger(state.attempts) || state.attempts < 0) {
      throw new InvalidDocumentIndexExecutionAttemptCountException({ attempts: state.attempts })
    }

    if (state.leaseExpiresAt !== null) assertValidDate(state.leaseExpiresAt, 'leaseExpiresAt')

    this.id = state.id
    this.status = state.status
    this.attempts = state.attempts
    this.leaseExpiry = state.leaseExpiresAt === null ? null : new Date(state.leaseExpiresAt.getTime())
  }

  get leaseExpiresAt(): Date | null {
    return this.leaseExpiry ? new Date(this.leaseExpiry.getTime()) : null
  }

  isLeaseExpiredAt(now: Date): boolean {
    assertValidDate(now, 'now')

    return this.leaseExpiry === null || this.leaseExpiry.getTime() <= now.getTime()
  }

  hasActiveLeaseAt(now: Date): boolean {
    assertValidDate(now, 'now')

    return this.leaseExpiry !== null && this.leaseExpiry.getTime() > now.getTime()
  }

  canRenewLeaseAt(now: Date, nextLeaseExpiry: Date): boolean {
    assertValidDate(now, 'now')
    assertValidDate(nextLeaseExpiry, 'leaseExpiresAt')

    return this.hasActiveLeaseAt(now) && nextLeaseExpiry.getTime() > now.getTime()
  }

  nextClaimAttempts(): number {
    if (this.status !== DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED) {
      throw new DocumentIndexExecutionClaimRequiresQueuedStateException({ status: this.status })
    }

    if (this.attempts >= MAX_ATTEMPTS) {
      throw new DocumentIndexExecutionClaimLimitReachedException({ attempts: this.attempts })
    }

    return this.attempts + 1
  }

  leaseExpiryFrom(now: Date, leaseSeconds: number): Date {
    assertValidDate(now, 'now')

    if (!Number.isFinite(leaseSeconds) || leaseSeconds <= 0) {
      throw new InvalidDocumentIndexExecutionLeaseDurationException({ leaseSeconds })
    }

    const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1_000)
    assertValidDate(leaseExpiresAt, 'leaseExpiresAt')

    return leaseExpiresAt
  }

  afterFailure(failure: DocumentIndexExecutionFailure): DocumentIndexExecutionFailureTransition {
    assertValidDate(failure.failedAt, 'failedAt')
    const terminal = this.attempts >= MAX_ATTEMPTS

    if (terminal) {
      return {
        terminal: true,
        errorMessage: failure.terminalErrorMessage ?? failure.errorMessage,
        retryAt: null,
      }
    }

    const retryAt = new Date(failure.failedAt.getTime() + Math.min(MAX_RETRY_DELAY_MS, 1_000 * 2 ** this.attempts))
    assertValidDate(retryAt, 'retryAt')

    return {
      terminal: false,
      errorMessage: failure.errorMessage,
      retryAt,
    }
  }
}

const assertValidDate = (value: Date, field: 'now' | 'failedAt' | 'leaseExpiresAt' | 'retryAt'): void => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new InvalidDocumentIndexExecutionTimestampException({ field })
  }
}
