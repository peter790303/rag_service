export const RAG_JOB_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
} as const

export type RagJobStatus = (typeof RAG_JOB_STATUS)[keyof typeof RAG_JOB_STATUS]

export type RagJobState = {
  id: string
  status: RagJobStatus
  attempts: number
  leaseExpiresAt: Date | null
}

export type RagJobFailure = {
  errorMessage: string
  terminalErrorMessage?: string
  failedAt: Date
}

export type RagJobFailureTransition =
  { terminal: true; errorMessage: string; retryAt: null } | { terminal: false; errorMessage: string; retryAt: Date }

const MAX_ATTEMPTS = 4
const MAX_RETRY_DELAY_MS = 60_000

/** Owns the persisted job identity and its attempt and lease lifecycle rules. */
export class RagJob {
  readonly id: string

  readonly status: RagJobStatus

  readonly attempts: number

  private readonly leaseExpiry: Date | null

  constructor(state: RagJobState) {
    if (!state.id.trim()) throw new TypeError('RAG job id must be non-empty')

    if (state.status !== RAG_JOB_STATUS.QUEUED && state.status !== RAG_JOB_STATUS.RUNNING) {
      throw new TypeError(`Unsupported RAG job status: ${state.status}`)
    }

    if (!Number.isSafeInteger(state.attempts) || state.attempts < 0) {
      throw new RangeError('RAG job attempts must be a non-negative safe integer')
    }

    if (state.leaseExpiresAt && !Number.isFinite(state.leaseExpiresAt.getTime())) {
      throw new TypeError('RAG job lease expiry must be a valid date')
    }

    this.id = state.id
    this.status = state.status
    this.attempts = state.attempts
    this.leaseExpiry = state.leaseExpiresAt ? new Date(state.leaseExpiresAt.getTime()) : null
  }

  get leaseExpiresAt(): Date | null {
    return this.leaseExpiry ? new Date(this.leaseExpiry.getTime()) : null
  }

  isLeaseExpiredAt(now: Date): boolean {
    assertValidDate(now, 'Current time')

    return this.leaseExpiry === null || this.leaseExpiry.getTime() <= now.getTime()
  }

  hasActiveLeaseAt(now: Date): boolean {
    assertValidDate(now, 'Current time')

    return this.leaseExpiry !== null && this.leaseExpiry.getTime() > now.getTime()
  }

  canRenewLeaseAt(now: Date, nextLeaseExpiry: Date): boolean {
    assertValidDate(now, 'Current time')

    return (
      this.hasActiveLeaseAt(now) &&
      Number.isFinite(nextLeaseExpiry.getTime()) &&
      nextLeaseExpiry.getTime() > now.getTime()
    )
  }

  nextClaimAttempts(): number {
    if (this.status !== RAG_JOB_STATUS.QUEUED || this.attempts >= MAX_ATTEMPTS) {
      throw new RangeError('RAG jobs may be claimed at most four times')
    }

    return this.attempts + 1
  }

  leaseExpiryFrom(now: Date, leaseSeconds: number): Date {
    assertValidDate(now, 'Current time')

    if (!Number.isFinite(leaseSeconds) || leaseSeconds <= 0) {
      throw new RangeError('RAG job lease duration must be positive and finite')
    }

    return new Date(now.getTime() + leaseSeconds * 1_000)
  }

  afterFailure(failure: RagJobFailure): RagJobFailureTransition {
    assertValidDate(failure.failedAt, 'Failure time')
    const terminal = this.attempts >= MAX_ATTEMPTS

    if (terminal) {
      return {
        terminal: true,
        errorMessage: failure.terminalErrorMessage ?? failure.errorMessage,
        retryAt: null,
      }
    }

    return {
      terminal: false,
      errorMessage: failure.errorMessage,
      retryAt: new Date(failure.failedAt.getTime() + Math.min(MAX_RETRY_DELAY_MS, 1_000 * 2 ** this.attempts)),
    }
  }
}

const assertValidDate = (value: Date, label: string): void => {
  if (!Number.isFinite(value.getTime())) throw new TypeError(`${label} must be a valid date`)
}
