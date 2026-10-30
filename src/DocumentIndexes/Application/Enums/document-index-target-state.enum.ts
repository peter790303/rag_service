export const DocumentIndexTargetStateEnum = {
  READY: 'ready',
  QUEUED: 'queued',
  BUILDING: 'building',
  FAILED_BLOCKED: 'failed-blocked',
  NEEDS_INDEX: 'needs-index',
} as const

export type DocumentIndexTargetStateEnum =
  (typeof DocumentIndexTargetStateEnum)[keyof typeof DocumentIndexTargetStateEnum]
