export interface IndexRetentionReferences {
  hasMembership: boolean
  hasJob: boolean
  hasFailedJob: boolean
}

/** An index may be removed only when no active or retry workflow references it. */
export class IndexRetentionPolicy {
  static mayCollect(references: IndexRetentionReferences): boolean {
    return !references.hasMembership && !references.hasJob && !references.hasFailedJob
  }
}
