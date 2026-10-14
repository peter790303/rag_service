export const RAG_INDEX_REQUEST_OUTCOME_KINDS = {
  activated: 'activated',
  reuse: 'reuse',
  blocked: 'blocked',
  queued: 'queued',
  targetMissing: 'target-missing',
  enqueue: 'enqueue',
} as const

export type RagIndexRequestOutcomeKind =
  (typeof RAG_INDEX_REQUEST_OUTCOME_KINDS)[keyof typeof RAG_INDEX_REQUEST_OUTCOME_KINDS]
