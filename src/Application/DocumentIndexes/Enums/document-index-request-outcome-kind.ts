export const DOCUMENT_INDEX_REQUEST_OUTCOME_KINDS = {
  activated: 'activated',
  reuse: 'reuse',
  blocked: 'blocked',
  queued: 'queued',
  targetMissing: 'target-missing',
  enqueue: 'enqueue',
} as const

export type DocumentIndexRequestOutcomeKind =
  (typeof DOCUMENT_INDEX_REQUEST_OUTCOME_KINDS)[keyof typeof DOCUMENT_INDEX_REQUEST_OUTCOME_KINDS]
