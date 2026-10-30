export type RetryUnretriedDocumentIndexFailuresResultDTO = {
  readonly queued: readonly { failedJobId: string; jobId: string }[]
  readonly skipped: readonly { failedJobId: string; reason: string }[]
  readonly failures: readonly { failedJobId: string; reason: string }[]
}
