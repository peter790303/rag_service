import {
  DOCUMENT_INDEX_EXECUTION_STATUS,
  type DocumentIndexExecutionStatus,
} from './document-index-execution-lifecycle.helper.ts'
import {
  DocumentIndexStatusEnum,
  type DocumentIndexStatus,
} from '../../../Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { DocumentIndexTargetStateEnum } from '../Enums/document-index-target-state.enum.ts'

export class DocumentIndexTargetStateHelper {
  static targetState(
    status: DocumentIndexStatus,
    currentJobStatus: DocumentIndexExecutionStatus | null,
    hasCurrentUnretriedFailure: boolean,
  ): DocumentIndexTargetStateEnum {
    if (status === DocumentIndexStatusEnum.READY) return DocumentIndexTargetStateEnum.READY

    if (currentJobStatus) {
      return currentJobStatus === DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING
        ? DocumentIndexTargetStateEnum.BUILDING
        : DocumentIndexTargetStateEnum.QUEUED
    }

    return hasCurrentUnretriedFailure
      ? DocumentIndexTargetStateEnum.FAILED_BLOCKED
      : DocumentIndexTargetStateEnum.NEEDS_INDEX
  }
}
