import { DocumentIndexStatusEnum } from '../../../Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import type { GetMembershipIndexingStateUseCaseContract } from '../../Memberships/Contracts/get-membership-indexing-state.use-case.contract.ts'
import { ReadStatusDocumentIndexesAssembler } from '../Assemblers/read-status-document-indexes.assembler.ts'
import type { DocumentIndexExecutionQueue } from '../Contracts/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../Contracts/document-index-failure.archive.ts'
import type { DocumentIndexRepository } from '../Contracts/document-index.repository.ts'
import type { DocumentIndexingStatusFacts } from '../DataTransferObjects/document-indexing-status-facts.dto.ts'
import type { DocumentIndexingStatusSourceDto } from '../DataTransferObjects/document-indexing-status-source.dto.ts'
import type { DocumentIndexingStatusDto } from '../DataTransferObjects/document-indexing-status.dto.ts'
import type { ReadDocumentIndexingStatusDto } from '../DataTransferObjects/read-document-indexing-status.dto.ts'
import { DocumentIndexingTargetStateEnum } from '../Enums/document-indexing-target-state.enum.ts'
import { DocumentIndexingNotFoundException } from '../Exceptions/document-indexing-not-found.exception.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../Helpers/document-index-execution-lifecycle.helper.ts'

type RequestedTargetFacts = NonNullable<DocumentIndexingStatusFacts['requestedTarget']>['targetStateFacts']

const resolveRequestedTargetState = (
  requestedTargetStateFacts: RequestedTargetFacts,
): DocumentIndexingTargetStateEnum => {
  if (requestedTargetStateFacts.requestedGeneration !== requestedTargetStateFacts.targetGeneration)
    return DocumentIndexingTargetStateEnum.SUPERSEDED

  if (requestedTargetStateFacts.activeJobStatus) {
    return requestedTargetStateFacts.activeJobStatus === DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING
      ? DocumentIndexingTargetStateEnum.RUNNING
      : DocumentIndexingTargetStateEnum.QUEUED
  }

  if (requestedTargetStateFacts.hasFailedJob) return DocumentIndexingTargetStateEnum.FAILED

  return requestedTargetStateFacts.targetIndexStatus === DocumentIndexStatusEnum.READY
    ? DocumentIndexingTargetStateEnum.READY
    : DocumentIndexingTargetStateEnum.FAILED
}

export class ReadDocumentIndexingStatusListener {
  constructor(
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly getMembershipIndexingState: GetMembershipIndexingStateUseCaseContract,
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly documentIndexFailureArchive: DocumentIndexFailureArchive,
  ) {}

  async handle({ projectId, jobId }: ReadDocumentIndexingStatusDto): Promise<DocumentIndexingStatusDto> {
    const source = await this.findByProjectIdAndJobIdOrFailedRecordIdWithStatusSourceProjection(projectId, jobId)
    const membership = await this.getMembershipIndexingState.execute({
      knowledgeBaseId: source.knowledgeBaseId,
      documentId: source.documentId,
    })
    const activeIndexId = membership?.activeDocumentIndexId ?? null
    const activeIndex =
      activeIndexId === null
        ? null
        : await this.documentIndexRepository.findByDocumentIndexId({ documentIndexId: activeIndexId })
    const targetIndex = await this.documentIndexRepository.findByDocumentIndexId({ documentIndexId: source.indexId })
    const jobStatusFacts = ReadStatusDocumentIndexesAssembler.toDocumentIndexingStatusFacts(
      source,
      membership,
      activeIndex,
      targetIndex,
    )

    const requestedTargetState =
      jobStatusFacts.requestedTarget === null
        ? null
        : resolveRequestedTargetState(jobStatusFacts.requestedTarget.targetStateFacts)

    return ReadStatusDocumentIndexesAssembler.toDocumentIndexingStatus(jobStatusFacts, requestedTargetState)
  }

  private async findByProjectIdAndJobIdOrFailedRecordIdWithStatusSourceProjection(
    projectId: string,
    jobId: string,
  ): Promise<DocumentIndexingStatusSourceDto> {
    const activeJob = await this.documentIndexExecutionQueue.findExecutionInProject({ projectId, id: jobId })

    if (activeJob !== null) {
      if (!activeJob.knowledgeBaseId || !activeJob.documentId || !activeJob.documentIndexId || !activeJob.generation)
        throw new DocumentIndexingNotFoundException(jobId)

      return ReadStatusDocumentIndexesAssembler.toActiveIndexingStatusSource(activeJob)
    }

    const failedJob = await this.documentIndexFailureArchive.findFailureInProject({
      projectId,
      idOrJobId: jobId,
    })

    if (
      failedJob === null ||
      !failedJob.knowledgeBaseId ||
      !failedJob.documentId ||
      !failedJob.documentIndexId ||
      !failedJob.generation
    )
      throw new DocumentIndexingNotFoundException(jobId)

    return ReadStatusDocumentIndexesAssembler.toFailedIndexingStatusSource(failedJob)
  }
}
