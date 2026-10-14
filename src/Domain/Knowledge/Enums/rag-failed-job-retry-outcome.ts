export const RAG_FAILED_JOB_RETRY_OUTCOME_KIND = {
  NOT_RETRYABLE: 'not-retryable',
  RETRY: 'retry',
} as const

export type RagFailedJobRetryOutcomeKind =
  (typeof RAG_FAILED_JOB_RETRY_OUTCOME_KIND)[keyof typeof RAG_FAILED_JOB_RETRY_OUTCOME_KIND]

export const RAG_FAILED_JOB_RETRY_STATUS = {
  NOT_FOUND: 'not-found',
  ALREADY_RETRIED: 'already-retried',
  ACTIVE_JOB_EXISTS: 'active-job-exists',
  NOT_CURRENT: 'not-current',
  STALE: 'stale',
  QUEUED: 'queued',
  RETRIED: 'retried',
} as const

export type RagFailedJobRetryStatus = (typeof RAG_FAILED_JOB_RETRY_STATUS)[keyof typeof RAG_FAILED_JOB_RETRY_STATUS]

export type RagFailedJobNotRetryableStatus =
  | typeof RAG_FAILED_JOB_RETRY_STATUS.NOT_FOUND
  | typeof RAG_FAILED_JOB_RETRY_STATUS.ALREADY_RETRIED
  | typeof RAG_FAILED_JOB_RETRY_STATUS.ACTIVE_JOB_EXISTS
  | typeof RAG_FAILED_JOB_RETRY_STATUS.NOT_CURRENT
  | typeof RAG_FAILED_JOB_RETRY_STATUS.STALE
