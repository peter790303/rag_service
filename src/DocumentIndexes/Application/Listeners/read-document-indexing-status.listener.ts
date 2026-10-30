import type { GetKnowledgeBaseDocumentIndexingStateQueryHandlerContract } from '../../../KnowledgeBases/Application/Contracts/get-knowledge-base-document-indexing-state.query.handler.contract.ts'
import { ReadStatusDocumentIndexesAssembler } from '../Assemblers/read-status-document-indexes.assembler.ts'
import type { DocumentIndexingStatusFacts } from '../DataTransferObjects/document-indexing-status-facts.dto.ts'
import type { DocumentIndexingStatusSourceDTO } from '../DataTransferObjects/document-indexing-status-source.dto.ts'
import type { DocumentIndexingStatusDTO } from '../DataTransferObjects/document-indexing-status.dto.ts'
import type { ReadDocumentIndexingStatusDTO } from '../DataTransferObjects/read-document-indexing-status.dto.ts'
import { DocumentIndexingTargetStateEnum } from '../Enums/document-indexing-target-state.enum.ts'
import { DocumentIndexingNotFoundException } from '../Exceptions/document-indexing-not-found.exception.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../Helpers/document-index-execution-lifecycle.helper.ts'
import type { DocumentIndexExecutionQueue } from '../Ports/Out/Gateways/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../Ports/Out/Gateways/document-index-failure.archive.ts'
import type { DocumentIndexSuccessArchive } from '../Ports/Out/Gateways/document-index-success.archive.ts'
import type { DocumentIndexRepository } from '../Ports/Out/Repositories/document-index.repository.ts'

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

  return requestedTargetStateFacts.hasSuccessfulReceipt
    ? DocumentIndexingTargetStateEnum.READY
    : DocumentIndexingTargetStateEnum.FAILED
}

export class ReadDocumentIndexingStatusListener {
  constructor(
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly getKnowledgeBaseDocumentIndexingState: GetKnowledgeBaseDocumentIndexingStateQueryHandlerContract,
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly documentIndexFailureArchive: DocumentIndexFailureArchive,
    private readonly documentIndexSuccessArchive: DocumentIndexSuccessArchive,
  ) {}

  async handle({ projectId, jobId }: ReadDocumentIndexingStatusDTO): Promise<DocumentIndexingStatusDTO> {
    const source = await this.findByProjectIdAndJobIdOrFailedRecordIdWithStatusSourceProjection(projectId, jobId)
    const knowledgeBaseDocument = await this.getKnowledgeBaseDocumentIndexingState.execute({
      knowledgeBaseId: source.knowledgeBaseId,
      documentId: source.documentId,
    })
    const activeIndexId = knowledgeBaseDocument?.activeDocumentIndexId ?? null
    const activeIndex =
      activeIndexId === null
        ? null
        : await this.documentIndexRepository.findByDocumentIndexId({ documentIndexId: activeIndexId })
    const jobStatusFacts = ReadStatusDocumentIndexesAssembler.toDocumentIndexingStatusFacts(
      source,
      knowledgeBaseDocument,
      activeIndex,
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
  ): Promise<DocumentIndexingStatusSourceDTO> {
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

    if (failedJob !== null) {
      if (!failedJob.knowledgeBaseId || !failedJob.documentId || !failedJob.documentIndexId || !failedJob.generation)
        throw new DocumentIndexingNotFoundException(jobId)

      return ReadStatusDocumentIndexesAssembler.toFailedIndexingStatusSource(failedJob)
    }

    const successReceipt = await this.documentIndexSuccessArchive.findSuccessByProjectIdAndJobId({ projectId, jobId })

    if (
      successReceipt === null ||
      !successReceipt.knowledgeBaseId ||
      !successReceipt.documentId ||
      !successReceipt.documentIndexId ||
      !successReceipt.generation
    )
      throw new DocumentIndexingNotFoundException(jobId)

    return ReadStatusDocumentIndexesAssembler.toSuccessfulIndexingStatusSource(successReceipt)
  }
}
