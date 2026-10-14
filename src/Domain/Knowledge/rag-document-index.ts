import { RAG_DOCUMENT_INDEX_STATUS, type RagDocumentIndexStatus } from './Enums/rag-document-index-status.enum.js'
import { RagIndexTargetStateEnum } from './Enums/rag-index-target-state.enum.js'
import { RAG_JOB_STATUS, type RagJobStatus } from './rag-job.js'

export type RagDocumentIndexState = {
  id: string
  status: RagDocumentIndexStatus
  readyAt: Date | null
  unreferencedSince: Date | null
}

/** Owns an index identity and the lifecycle timestamps associated with its readiness and retention. */
export class RagDocumentIndex {
  static targetState(
    status: RagDocumentIndexStatus,
    currentJobStatus: RagJobStatus | null,
    hasCurrentUnretriedFailure: boolean,
  ): RagIndexTargetStateEnum {
    if (status === RAG_DOCUMENT_INDEX_STATUS.READY) return RagIndexTargetStateEnum.READY

    if (currentJobStatus) {
      return currentJobStatus === RAG_JOB_STATUS.RUNNING
        ? RagIndexTargetStateEnum.BUILDING
        : RagIndexTargetStateEnum.QUEUED
    }

    return hasCurrentUnretriedFailure ? RagIndexTargetStateEnum.FAILED_BLOCKED : RagIndexTargetStateEnum.NEEDS_INDEX
  }

  readonly id: string

  readonly status: RagDocumentIndexStatus

  private readonly readyTime: Date | null

  private readonly unreferencedTime: Date | null

  constructor(state: RagDocumentIndexState) {
    if (!state.id.trim()) throw new TypeError('RAG document index id must be non-empty')

    if (!Object.values(RAG_DOCUMENT_INDEX_STATUS).includes(state.status)) {
      throw new TypeError(`Unsupported RAG document index status: ${state.status}`)
    }

    assertValidDateOrNull(state.readyAt, 'Index ready time')
    assertValidDateOrNull(state.unreferencedSince, 'Index unreferenced time')

    this.id = state.id
    this.status = state.status
    this.readyTime = cloneDate(state.readyAt)
    this.unreferencedTime = cloneDate(state.unreferencedSince)
  }

  get readyAt(): Date | null {
    return cloneDate(this.readyTime)
  }

  get unreferencedSince(): Date | null {
    return cloneDate(this.unreferencedTime)
  }

  canReplacePlan(): boolean {
    return this.status !== RAG_DOCUMENT_INDEX_STATUS.READY
  }

  markReady(at: Date): RagDocumentIndex {
    assertValidDate(at, 'Index ready time')

    return new RagDocumentIndex({
      id: this.id,
      status: RAG_DOCUMENT_INDEX_STATUS.READY,
      readyAt: at,
      unreferencedSince: null,
    })
  }

  markUnreferenced(at: Date): RagDocumentIndex {
    assertValidDate(at, 'Index unreferenced time')

    return new RagDocumentIndex({
      id: this.id,
      status: this.status,
      readyAt: this.readyTime,
      unreferencedSince: at,
    })
  }
}

const cloneDate = (value: Date | null): Date | null => (value ? new Date(value.getTime()) : null)

const assertValidDateOrNull = (value: Date | null, label: string): void => {
  if (value !== null) assertValidDate(value, label)
}

const assertValidDate = (value: Date, label: string): void => {
  if (!Number.isFinite(value.getTime())) throw new TypeError(`${label} must be a valid date`)
}
