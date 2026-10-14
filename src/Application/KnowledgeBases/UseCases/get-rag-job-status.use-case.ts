import { RAG_DOCUMENT_INDEX_STATUS } from '../../../Domain/Knowledge/Enums/rag-document-index-status.enum.js'
import { RagJobTargetStateEnum } from '../../../Domain/Knowledge/Enums/rag-job-target-state.enum.js'
import { RAG_JOB_STATUS } from '../../../Domain/Knowledge/rag-job.js'
import type { RagJobStatusFacts, RagJobStatusReader } from '../Contracts/rag-job-management.js'
import type { RagJobStatusDto } from '../DataTransferObjects/rag.dto.js'

type RequestedTargetFacts = NonNullable<RagJobStatusFacts['requestedTarget']>['targetStateFacts']

const resolveRequestedTargetState = (facts: RequestedTargetFacts): RagJobTargetStateEnum => {
  if (facts.requestedGeneration !== facts.targetGeneration) return RagJobTargetStateEnum.SUPERSEDED

  if (facts.activeJobStatus) {
    return facts.activeJobStatus === RAG_JOB_STATUS.RUNNING
      ? RagJobTargetStateEnum.RUNNING
      : RagJobTargetStateEnum.QUEUED
  }

  if (facts.hasFailedJob) return RagJobTargetStateEnum.FAILED

  return facts.targetIndexStatus === RAG_DOCUMENT_INDEX_STATUS.READY
    ? RagJobTargetStateEnum.READY
    : RagJobTargetStateEnum.FAILED
}

export class GetRagJobStatusUseCase {
  constructor(private readonly rag: RagJobStatusReader) {}

  async execute(projectId: string, id: string): Promise<RagJobStatusDto> {
    const facts = await this.rag.jobStatus(projectId, id)
    const requestedTarget = facts.requestedTarget

    return {
      activeIndex: facts.activeIndex,
      requestedTarget: requestedTarget
        ? {
            indexId: requestedTarget.indexId,
            generation: requestedTarget.generation,
            state: resolveRequestedTargetState(requestedTarget.targetStateFacts),
            jobId: requestedTarget.jobId,
            failedJobId: requestedTarget.failedJobId,
            attempts: requestedTarget.attempts,
            errorCode: requestedTarget.errorCode,
            errorMessage: requestedTarget.errorMessage,
            executionVerification: requestedTarget.executionVerification,
          }
        : null,
    }
  }
}
