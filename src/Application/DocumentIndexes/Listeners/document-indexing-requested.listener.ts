import { createHash, randomUUID } from 'node:crypto'

import { concatMap, from, lastValueFrom, range, takeWhile } from 'rxjs'

import { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import { DocumentIndexStatusEnum } from '../../../Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import type { DocumentIndexStatus } from '../../../Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import type { PrepareDocumentRevisionForIndexRequestUseCaseContract } from '../../DocumentRevisions/Contracts/prepare-document-revision-for-index-request.use-case.contract.ts'
import type { PrepareDocumentForIndexRequestUseCaseContract } from '../../Documents/Contracts/prepare-document-for-index-request.use-case.contract.ts'
import type { SourceDocumentDTO } from '../../Documents/DataTransferObjects/source-document.dto.ts'
import type { PrepareKnowledgeBaseDocumentForIndexRequestUseCaseContract } from '../../KnowledgeBaseDocuments/Contracts/prepare-knowledge-base-document-for-index-request.use-case.contract.ts'
import type { SaveKnowledgeBaseDocumentIndexRequestUseCaseContract } from '../../KnowledgeBaseDocuments/Contracts/save-knowledge-base-document-index-request.use-case.contract.ts'
import type { EnsureIndexingKnowledgeBaseUseCaseContract } from '../../KnowledgeBases/Contracts/ensure-indexing-knowledge-base.use-case.contract.ts'
import type { PersistenceTransaction } from '../../KnowledgeBases/Contracts/persistence-transaction.ts'
import { WriteLifecycleDocumentIndexAssembler } from '../Assemblers/write-lifecycle-document-index.assembler.ts'
import {
  WriteRequestDocumentIndexesAssembler,
  type DocumentIndexPipelineSettings,
} from '../Assemblers/write-request-document-indexes.assembler.ts'
import type { DocumentIndexExecutionQueue } from '../Contracts/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../Contracts/document-index-failure.archive.ts'
import type { DocumentIndexRepository } from '../Contracts/document-index.repository.ts'
import type { StartDocumentIndexPruningRetentionUseCaseContract } from '../Contracts/start-document-index-pruning-retention.use-case.contract.ts'
import type { DocumentIndexRequestResult } from '../DataTransferObjects/document-index-request.dto.ts'
import { DOCUMENT_INDEX_REQUEST_OUTCOME_KINDS } from '../Enums/document-index-request-outcome-kind.ts'
import { DocumentIndexTargetStateEnum } from '../Enums/document-index-target-state.enum.ts'
import type { DocumentIndexingRequestedEvent } from '../Events/document-indexing-requested.event.ts'
import { PreparedIndexCollectedException } from '../Exceptions/prepared-index-collected.exception.ts'
import { type DocumentIndexExecutionStatus } from '../Helpers/document-index-execution-lifecycle.helper.ts'
import { DocumentIndexTargetStateHelper } from '../Helpers/document-index-target-state.helper.ts'

const MAX_TARGET_REPREPARATIONS = 3

type CurrentDocumentIndexExecution = {
  id: string
  documentIndexId: string
  generation: string
  status: DocumentIndexExecutionStatus
} | null

type TargetDecision = { targetState: DocumentIndexTargetStateEnum; generation: string }

type EnqueueDecision =
  | { kind: typeof DOCUMENT_INDEX_REQUEST_OUTCOME_KINDS.reuse; jobId: string; generation: string }
  | { kind: typeof DOCUMENT_INDEX_REQUEST_OUTCOME_KINDS.blocked; generation: string }
  | { kind: typeof DOCUMENT_INDEX_REQUEST_OUTCOME_KINDS.enqueue; generation: string }

/** Coordinates cross-record request decisions and persistence steps atomically. */
export class DocumentIndexingRequestedListener {
  constructor(
    private readonly transaction: PersistenceTransaction,
    private readonly ensureIndexingKnowledgeBase: EnsureIndexingKnowledgeBaseUseCaseContract,
    private readonly prepareDocumentForIndexRequest: PrepareDocumentForIndexRequestUseCaseContract,
    private readonly prepareKnowledgeBaseDocumentForIndexRequest: PrepareKnowledgeBaseDocumentForIndexRequestUseCaseContract,
    private readonly prepareDocumentRevisionForIndexRequest: PrepareDocumentRevisionForIndexRequestUseCaseContract,
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexFailureArchive: DocumentIndexFailureArchive,
    private readonly pipelineSettings: DocumentIndexPipelineSettings,
    private readonly writeRequestDocumentIndexesAssembler: WriteRequestDocumentIndexesAssembler,
    private readonly saveKnowledgeBaseDocumentIndexRequest: SaveKnowledgeBaseDocumentIndexRequestUseCaseContract,
    private readonly startIndexRetention: StartDocumentIndexPruningRetentionUseCaseContract,
  ) {}

  async handle(event: DocumentIndexingRequestedEvent): Promise<DocumentIndexRequestResult> {
    const sourceDocumentDTO = event.sourceDocument
    const contentSha256 = createHash('sha256').update(sourceDocumentDTO.content).digest('hex')
    const pipelineHash = createHash('sha256')
      .update(
        this.writeRequestDocumentIndexesAssembler.serializeDocumentIndexPipelineHashInput({
          contentSha256,
          embeddingModel: this.pipelineSettings.embeddingModel,
          embeddingDimensions: this.pipelineSettings.embeddingDimensions,
          chunkingModel: this.pipelineSettings.chunkingModel,
          context: sourceDocumentDTO.payload,
        }),
      )
      .digest('hex')
    const pipelineMetadata = this.writeRequestDocumentIndexesAssembler.toDocumentIndexPipelineMetadata({
      contentSha256,
      pipelineHash,
    })

    // Each retry opens a fresh transaction after a collector removed the prepared index.
    const prepareDocumentIndexRequest = async (): Promise<DocumentIndexRequestResult | null> =>
      this.transaction.run(() => this.requestWithin(sourceDocumentDTO, pipelineMetadata))
    const canReprepareTarget = (result: DocumentIndexRequestResult | null): boolean => result === null
    const documentIndexRequestResult = await lastValueFrom(
      range(0, MAX_TARGET_REPREPARATIONS).pipe(
        concatMap(prepareDocumentIndexRequest),
        takeWhile(canReprepareTarget, true),
      ),
      { defaultValue: null },
    )

    if (documentIndexRequestResult) return documentIndexRequestResult

    throw new PreparedIndexCollectedException()
  }

  private async requestWithin(
    sourceDocumentDTO: SourceDocumentDTO & { readonly payload: Record<string, unknown> },
    pipelineMetadata: ReturnType<WriteRequestDocumentIndexesAssembler['toDocumentIndexPipelineMetadata']>,
  ): Promise<DocumentIndexRequestResult | null> {
    await this.ensureIndexingKnowledgeBase.execute(sourceDocumentDTO)
    const document = await this.prepareDocumentForIndexRequest.execute(sourceDocumentDTO)
    const documentId = document.id
    const requestKnowledgeBaseDocument = await this.prepareKnowledgeBaseDocumentForIndexRequest.execute({
      sourceDocument: {
        knowledgeBaseId: sourceDocumentDTO.knowledgeBaseId,
        ...(sourceDocumentDTO.isEntry === undefined ? {} : { isEntry: sourceDocumentDTO.isEntry }),
        ...(sourceDocumentDTO.alwaysIncludeFullContent === undefined
          ? {}
          : { alwaysIncludeFullContent: sourceDocumentDTO.alwaysIncludeFullContent }),
      },
      documentId,
    })
    const revision = await this.prepareDocumentRevisionForIndexRequest.execute({
      sourceDocument: {
        ...(sourceDocumentDTO.title === undefined ? {} : { title: sourceDocumentDTO.title }),
        content: sourceDocumentDTO.content,
      },
      documentId,
      contentSha256: pipelineMetadata.contentSha256,
    })
    const revisionId = revision.id
    const knowledgeBaseDocumentQO = { knowledgeBaseId: sourceDocumentDTO.knowledgeBaseId, documentId }
    let restoredTargetDocumentIndexDTO = await this.documentIndexRepository.findByDocumentRevisionIdAndPipelineHash({
      revisionId,
      pipelineHash: pipelineMetadata.pipelineHash,
    })

    if (!restoredTargetDocumentIndexDTO) {
      const buildingDocumentIndex = new DocumentIndex({
        id: randomUUID(),
        documentId,
        revisionId,
        pipelineHash: pipelineMetadata.pipelineHash,
        chunkingModel: pipelineMetadata.chunkingModel,
        chunkingProfile: pipelineMetadata.chunkingProfile,
        embeddingModel: pipelineMetadata.embeddingModel,
        embeddingDimensions: pipelineMetadata.embeddingDimensions,
        embeddingProfile: pipelineMetadata.embeddingProfile,
        lexicalProfile: pipelineMetadata.lexicalProfile,
        relationProfile: pipelineMetadata.relationProfile,
        status: DocumentIndexStatusEnum.BUILDING,
        createdAt: new Date(),
        readyAt: null,
        unreferencedSince: null,
      })
      const createBuildingDocumentIndexQO =
        this.writeRequestDocumentIndexesAssembler.toBuildingDocumentIndex(buildingDocumentIndex)
      await this.documentIndexRepository.createBuildingIndex(createBuildingDocumentIndexQO)
      restoredTargetDocumentIndexDTO = buildingDocumentIndex
    }

    const currentJobRecord =
      await this.documentIndexExecutionQueue.lockKnowledgeBaseDocumentExecution(knowledgeBaseDocumentQO)
    const currentJob = this.writeRequestDocumentIndexesAssembler.toDocumentIndexRequestExecution(currentJobRecord)
    const documentIndexIds = new Set([restoredTargetDocumentIndexDTO.id])

    if (requestKnowledgeBaseDocument.activeDocumentIndexId !== null)
      documentIndexIds.add(requestKnowledgeBaseDocument.activeDocumentIndexId)

    if (currentJob !== null) documentIndexIds.add(currentJob.documentIndexId)

    const sortedDocumentIndexIds = Array.from(documentIndexIds).sort()
    const targetDocumentIndexId = restoredTargetDocumentIndexDTO.id

    // All requests acquire shared index rows in the same order to avoid lock cycles.
    const lockedDocumentIndexes = new Map<string, DocumentIndex>()
    const lockDocumentIndex = async (documentIndexId: string): Promise<DocumentIndex | null> => {
      const restoredDocumentIndexDTO = await this.documentIndexRepository.lockByDocumentIndexId({ documentIndexId })

      if (restoredDocumentIndexDTO !== null)
        lockedDocumentIndexes.set(restoredDocumentIndexDTO.id, restoredDocumentIndexDTO)

      return restoredDocumentIndexDTO
    }
    await lastValueFrom(from(sortedDocumentIndexIds).pipe(concatMap(lockDocumentIndex)), { defaultValue: null })
    const lockedTargetDocumentIndex = lockedDocumentIndexes.get(targetDocumentIndexId)

    if (lockedTargetDocumentIndex === undefined) return null

    let hasCurrentUnretriedFailure = false

    if (lockedTargetDocumentIndex.status !== DocumentIndexStatusEnum.READY) {
      const unretriedFailedJobTargetQO =
        this.writeRequestDocumentIndexesAssembler.toUnretriedDocumentIndexFailureTargetQuery(
          sourceDocumentDTO.knowledgeBaseId,
          documentId,
          lockedTargetDocumentIndex.id,
          requestKnowledgeBaseDocument.requestedGeneration,
        )
      const unretriedFailedJob =
        await this.documentIndexFailureArchive.findUnretriedTargetFailure(unretriedFailedJobTargetQO)
      hasCurrentUnretriedFailure = unretriedFailedJob !== null
    }

    const documentIndexTargetDecision = this.decideTarget({
      currentGeneration: requestKnowledgeBaseDocument.requestedGeneration,
      activeDocumentIndexId: requestKnowledgeBaseDocument.activeDocumentIndexId,
      targetDocumentIndexId: lockedTargetDocumentIndex.id,
      targetIndexStatus: lockedTargetDocumentIndex.status,
      currentJob: currentJob,
      hasUnretriedFailure: hasCurrentUnretriedFailure,
    })

    if (documentIndexTargetDecision.targetState === DocumentIndexTargetStateEnum.READY) {
      await this.saveKnowledgeBaseDocumentIndexRequest.execute({
        knowledgeBaseDocument: requestKnowledgeBaseDocument,
        generation: documentIndexTargetDecision.generation,
        activeDocumentIndexId: lockedTargetDocumentIndex.id,
      })
      await this.documentIndexRepository.updateByDocumentIndexIdWithUnreferencedSince(
        WriteLifecycleDocumentIndexAssembler.toSetDocumentIndexUnreferencedSinceQO(
          lockedTargetDocumentIndex.markReferenced(),
        ),
      )

      if (currentJob) await this.documentIndexExecutionQueue.releaseExecution({ jobId: currentJob.id })

      if (currentJob && currentJob.documentIndexId !== lockedTargetDocumentIndex.id)
        await this.startIndexRetention.execute({ documentIndexIds: [currentJob.documentIndexId], now: new Date() })

      const previousActiveDocumentIndex = requestKnowledgeBaseDocument.activeDocumentIndexId
        ? lockedDocumentIndexes.get(requestKnowledgeBaseDocument.activeDocumentIndexId)
        : undefined

      if (previousActiveDocumentIndex !== undefined && previousActiveDocumentIndex.id !== lockedTargetDocumentIndex.id)
        await this.documentIndexRepository.updateByDocumentIndexIdWithUnreferencedSince(
          WriteLifecycleDocumentIndexAssembler.toSetDocumentIndexUnreferencedSinceQO(
            previousActiveDocumentIndex.markUnreferenced(new Date()),
          ),
        )

      return this.writeRequestDocumentIndexesAssembler.toDocumentIndexRequestResult(
        documentId,
        revisionId,
        lockedTargetDocumentIndex.id,
        null,
        documentIndexTargetDecision.generation,
        true,
        false,
      )
    }

    if (
      documentIndexTargetDecision.targetState === DocumentIndexTargetStateEnum.QUEUED ||
      documentIndexTargetDecision.targetState === DocumentIndexTargetStateEnum.BUILDING
    ) {
      return this.writeRequestDocumentIndexesAssembler.toDocumentIndexRequestResult(
        documentId,
        revisionId,
        lockedTargetDocumentIndex.id,
        currentJob === null ? null : currentJob.id,
        documentIndexTargetDecision.generation,
        false,
        false,
      )
    }

    if (documentIndexTargetDecision.targetState === DocumentIndexTargetStateEnum.FAILED_BLOCKED) {
      return this.writeRequestDocumentIndexesAssembler.toDocumentIndexRequestResult(
        documentId,
        revisionId,
        lockedTargetDocumentIndex.id,
        null,
        documentIndexTargetDecision.generation,
        false,
        true,
      )
    }

    const requestedGeneration = documentIndexTargetDecision.generation
    const requestedGenerationFailureQO =
      this.writeRequestDocumentIndexesAssembler.toUnretriedDocumentIndexFailureTargetQuery(
        sourceDocumentDTO.knowledgeBaseId,
        documentId,
        lockedTargetDocumentIndex.id,
        requestedGeneration,
      )
    const requestedGenerationFailedJob =
      await this.documentIndexFailureArchive.findUnretriedTargetFailure(requestedGenerationFailureQO)
    const hasRequestedGenerationFailure = requestedGenerationFailedJob !== null
    const jobEnqueueDecision = this.decideEnqueue({
      currentGeneration: requestKnowledgeBaseDocument.requestedGeneration,
      requestedGeneration,
      targetDocumentIndexId: lockedTargetDocumentIndex.id,
      currentJob: currentJob,
      hasUnretriedFailure: hasRequestedGenerationFailure,
    })

    if (jobEnqueueDecision.kind === DOCUMENT_INDEX_REQUEST_OUTCOME_KINDS.reuse) {
      return this.writeRequestDocumentIndexesAssembler.toDocumentIndexRequestResult(
        documentId,
        revisionId,
        lockedTargetDocumentIndex.id,
        jobEnqueueDecision.jobId,
        jobEnqueueDecision.generation,
        false,
        false,
      )
    }

    if (jobEnqueueDecision.kind === DOCUMENT_INDEX_REQUEST_OUTCOME_KINDS.blocked) {
      return this.writeRequestDocumentIndexesAssembler.toDocumentIndexRequestResult(
        documentId,
        revisionId,
        lockedTargetDocumentIndex.id,
        null,
        jobEnqueueDecision.generation,
        false,
        true,
      )
    }

    if (currentJob) await this.documentIndexExecutionQueue.releaseExecution({ jobId: currentJob.id })

    await this.saveKnowledgeBaseDocumentIndexRequest.execute({
      knowledgeBaseDocument: requestKnowledgeBaseDocument,
      generation: jobEnqueueDecision.generation,
      activeDocumentIndexId: requestKnowledgeBaseDocument.activeDocumentIndexId,
    })
    const queuedJob = this.writeRequestDocumentIndexesAssembler.toQueuedDocumentIndexExecution(
      sourceDocumentDTO,
      documentId,
      lockedTargetDocumentIndex.id,
      jobEnqueueDecision.generation,
      new Date(),
    )
    await this.documentIndexExecutionQueue.enqueue(queuedJob)
    const jobId = queuedJob.id

    if (currentJob && currentJob.documentIndexId !== lockedTargetDocumentIndex.id)
      await this.startIndexRetention.execute({ documentIndexIds: [currentJob.documentIndexId], now: new Date() })

    return this.writeRequestDocumentIndexesAssembler.toDocumentIndexRequestResult(
      documentId,
      revisionId,
      lockedTargetDocumentIndex.id,
      jobId,
      jobEnqueueDecision.generation,
      false,
      false,
    )
  }

  private decideTarget(targetDecisionInput: {
    currentGeneration: string
    activeDocumentIndexId: string | null
    targetDocumentIndexId: string
    targetIndexStatus: DocumentIndexStatus
    currentJob: CurrentDocumentIndexExecution
    hasUnretriedFailure: boolean
  }): TargetDecision {
    if (targetDecisionInput.targetIndexStatus === DocumentIndexStatusEnum.READY) {
      const generationChanged =
        targetDecisionInput.activeDocumentIndexId !== targetDecisionInput.targetDocumentIndexId ||
        (targetDecisionInput.currentJob?.generation === targetDecisionInput.currentGeneration &&
          targetDecisionInput.currentJob.documentIndexId !== targetDecisionInput.targetDocumentIndexId)
      const generation = generationChanged
        ? (BigInt(targetDecisionInput.currentGeneration) + 1n).toString()
        : targetDecisionInput.currentGeneration

      return {
        targetState: DocumentIndexTargetStateEnum.READY,
        generation,
      }
    }

    const targetJob =
      targetDecisionInput.currentJob?.documentIndexId === targetDecisionInput.targetDocumentIndexId &&
      targetDecisionInput.currentJob.generation === targetDecisionInput.currentGeneration
        ? targetDecisionInput.currentJob
        : null

    if (targetJob) {
      const targetState = DocumentIndexTargetStateHelper.targetState(
        targetDecisionInput.targetIndexStatus,
        targetJob.status,
        targetDecisionInput.hasUnretriedFailure,
      )

      return {
        targetState,
        generation: targetDecisionInput.currentGeneration,
      }
    }

    if (targetDecisionInput.hasUnretriedFailure) {
      const targetState = DocumentIndexTargetStateHelper.targetState(targetDecisionInput.targetIndexStatus, null, true)

      return {
        targetState,
        generation: targetDecisionInput.currentGeneration,
      }
    }

    const generation = (BigInt(targetDecisionInput.currentGeneration) + 1n).toString()

    return { targetState: DocumentIndexTargetStateEnum.NEEDS_INDEX, generation }
  }

  private decideEnqueue(enqueueDecisionInput: {
    currentGeneration: string
    requestedGeneration: string
    targetDocumentIndexId: string
    currentJob: CurrentDocumentIndexExecution
    hasUnretriedFailure: boolean
  }): EnqueueDecision {
    if (
      enqueueDecisionInput.currentJob?.documentIndexId === enqueueDecisionInput.targetDocumentIndexId &&
      enqueueDecisionInput.currentJob.generation === enqueueDecisionInput.currentGeneration
    ) {
      return {
        kind: DOCUMENT_INDEX_REQUEST_OUTCOME_KINDS.reuse,
        jobId: enqueueDecisionInput.currentJob.id,
        generation: enqueueDecisionInput.currentGeneration,
      }
    }

    if (enqueueDecisionInput.hasUnretriedFailure)
      return {
        kind: DOCUMENT_INDEX_REQUEST_OUTCOME_KINDS.blocked,
        generation: enqueueDecisionInput.requestedGeneration,
      }

    return { kind: DOCUMENT_INDEX_REQUEST_OUTCOME_KINDS.enqueue, generation: enqueueDecisionInput.requestedGeneration }
  }
}
