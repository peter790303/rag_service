export const DocumentIndexStatusEnum = {
  BUILDING: 'building',
  READY: 'ready',
  FAILED: 'failed',
  DELETING: 'deleting',
} as const

export type DocumentIndexStatus = (typeof DocumentIndexStatusEnum)[keyof typeof DocumentIndexStatusEnum]
