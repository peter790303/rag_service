export const RagIndexTargetStateEnum = {
  READY: 'ready',
  QUEUED: 'queued',
  BUILDING: 'building',
  FAILED_BLOCKED: 'failed-blocked',
  NEEDS_INDEX: 'needs-index',
} as const

export type RagIndexTargetStateEnum = (typeof RagIndexTargetStateEnum)[keyof typeof RagIndexTargetStateEnum]
