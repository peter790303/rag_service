export const DocumentIndexingTargetStateEnum = {
  QUEUED: 'queued',
  RUNNING: 'running',
  READY: 'ready',
  FAILED: 'failed',
  SUPERSEDED: 'superseded',
} as const

export type DocumentIndexingTargetStateEnum =
  (typeof DocumentIndexingTargetStateEnum)[keyof typeof DocumentIndexingTargetStateEnum]
