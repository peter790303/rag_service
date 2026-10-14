export const RagJobTargetStateEnum = {
  QUEUED: 'queued',
  RUNNING: 'running',
  READY: 'ready',
  FAILED: 'failed',
  SUPERSEDED: 'superseded',
} as const

export type RagJobTargetStateEnum = (typeof RagJobTargetStateEnum)[keyof typeof RagJobTargetStateEnum]
