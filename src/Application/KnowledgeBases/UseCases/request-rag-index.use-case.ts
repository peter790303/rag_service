import { RAG_DOCUMENT_INDEX_STATUS } from '../../../Domain/Knowledge/Enums/rag-document-index-status.enum.js'
import type { RagDocumentIndexStatus } from '../../../Domain/Knowledge/Enums/rag-document-index-status.enum.js'
import { RAG_INDEX_REQUEST_OUTCOME_KINDS } from '../../../Domain/Knowledge/Enums/rag-index-request-outcome-kind.js'
import { RagIndexTargetStateEnum } from '../../../Domain/Knowledge/Enums/rag-index-target-state.enum.js'
import { KnowledgeIndexPendingException } from '../../../Domain/Knowledge/Exceptions/knowledge-index-pending.exception.js'
import { RagDocumentIndex } from '../../../Domain/Knowledge/rag-document-index.js'
import { RAG_JOB_STATUS, type RagJobStatus } from '../../../Domain/Knowledge/rag-job.js'
import { RagKnowledgeBase } from '../../../Domain/Knowledge/rag-knowledge-base.js'
import { RagIndexRequestAssembler, type RagIndexPipelineSettings } from '../Assemblers/rag-index-request.assembler.js'
import type { RagCryptographyProvider } from '../Contracts/rag-cryptography-provider.js'
import type {
  RagIndexRequestTransaction,
  RagIndexRequestTransactionRepository,
} from '../Contracts/rag-index-request-transaction.js'
import type { RagIndexRequestResult, RagSourceDocumentDto } from '../DataTransferObjects/rag.dto.js'

const MAX_TARGET_REPREPARATIONS = 3

type CurrentIndexJob = { id: string; documentIndexId: string; generation: number; status: RagJobStatus } | null

type TargetDecision = { targetState: RagIndexTargetStateEnum; generation: number }

type EnqueueDecision =
  | { kind: typeof RAG_INDEX_REQUEST_OUTCOME_KINDS.reuse; jobId: string; generation: number }
  | { kind: typeof RAG_INDEX_REQUEST_OUTCOME_KINDS.blocked; generation: number }
  | { kind: typeof RAG_INDEX_REQUEST_OUTCOME_KINDS.enqueue; generation: number }

/** Coordinates cross-record request decisions and persistence steps atomically. */
export class RequestRagIndexUseCase {
  constructor(
    private readonly workflow: RagIndexRequestTransactionRepository,
    private readonly cryptography: RagCryptographyProvider,
    private readonly pipelineSettings: RagIndexPipelineSettings,
    private readonly assembler: RagIndexRequestAssembler,
  ) {}

  async execute(input: RagSourceDocumentDto): Promise<RagIndexRequestResult> {
    const contentSha256 = this.cryptography.sha256(input.content)
    const pipelineHash = this.cryptography.sha256(
      this.assembler.serializePipelineHashInput({
        contentSha256,
        embeddingModel: this.pipelineSettings.embeddingModel,
        embeddingDimensions: this.pipelineSettings.embeddingDimensions,
        chunkingModel: this.pipelineSettings.chunkingModel,
        context: input.payload,
      }),
    )
    const pipeline = this.assembler.assemblePipeline({ contentSha256, pipelineHash })

    const requestNextPreparedTarget = async (previousAttempt: Promise<RagIndexRequestResult | null>) => {
      const previousResult = await previousAttempt

      if (previousResult) return previousResult

      return this.workflow.withTransaction((transaction) => this.requestWithin(input, pipeline, transaction))
    }
    const result = await Array.from({ length: MAX_TARGET_REPREPARATIONS }).reduce(
      requestNextPreparedTarget,
      Promise.resolve<RagIndexRequestResult | null>(null),
    )

    if (result) return result

    throw new KnowledgeIndexPendingException('The prepared index was collected before it could be queued')
  }

  private async requestWithin(
    input: RagSourceDocumentDto,
    pipeline: ReturnType<RagIndexRequestAssembler['assemblePipeline']>,
    transaction: RagIndexRequestTransaction,
  ): Promise<RagIndexRequestResult | null> {
    const knowledgeBase = await transaction.lockKnowledgeBase(input.knowledgeBaseId)

    if (knowledgeBase) {
      knowledgeBase.assertProject(input.projectId)

      if (knowledgeBase.projectName !== input.projectName) {
        knowledgeBase.synchronizeProjectName(input.projectName)
        await transaction.saveKnowledgeBase(knowledgeBase)
      }
    } else {
      await transaction.createKnowledgeBase(
        RagKnowledgeBase.create({
          id: input.knowledgeBaseId,
          projectId: input.projectId,
          projectName: input.projectName,
        }),
      )
    }

    const { documentId } = await transaction.ensureSource({
      sourceType: input.sourceType,
      sourceKey: input.sourceKey,
      sourcePath: input.sourcePath,
      ...(input.title === undefined ? {} : { currentTitle: input.title }),
    })

    if (!(await transaction.lockDocument(documentId)))
      throw new KnowledgeIndexPendingException('Document is no longer available')

    await transaction.createMembershipIfMissing({
      knowledgeBaseId: input.knowledgeBaseId,
      documentId,
      initialState: {
        requestedGeneration: 0,
        activeDocumentIndexId: null,
        isEntry: false,
        alwaysIncludeFullContent: false,
      },
    })
    const membership = await transaction.lockMembership(input.knowledgeBaseId, documentId)

    if (!membership) throw new KnowledgeIndexPendingException('Membership is no longer available')

    await transaction.updateMembershipOptions({
      knowledgeBaseId: input.knowledgeBaseId,
      documentId,
      ...(input.isEntry === undefined ? {} : { isEntry: input.isEntry }),
      ...(input.alwaysIncludeFullContent === undefined
        ? {}
        : { alwaysIncludeFullContent: input.alwaysIncludeFullContent }),
    })

    const { revisionId } = await transaction.findOrCreateRevision({
      documentId,
      contentSha256: pipeline.contentSha256,
      title: input.title ?? null,
      content: input.content,
    })
    const targetIndex = await transaction.findOrCreateIndex({
      documentId,
      revisionId,
      ...pipeline,
      initialState: {
        status: RAG_DOCUMENT_INDEX_STATUS.BUILDING,
        readyAt: null,
        unreferencedSince: null,
      },
    })
    const currentJob = await transaction.lockCurrentJob(input.knowledgeBaseId, documentId)
    const lockedIndexes = await transaction.lockIndexesById([
      targetIndex.id,
      ...(membership.activeDocumentIndexId ? [membership.activeDocumentIndexId] : []),
      ...(currentJob ? [currentJob.documentIndexId] : []),
    ])
    const lockedTargetIndex = lockedIndexes.find((index) => index.id === targetIndex.id)

    if (!lockedTargetIndex) return null

    const hasCurrentUnretriedFailure =
      lockedTargetIndex.status !== RAG_DOCUMENT_INDEX_STATUS.READY &&
      (await transaction.hasUnretriedFailure({
        knowledgeBaseId: input.knowledgeBaseId,
        documentId,
        documentIndexId: lockedTargetIndex.id,
        generation: membership.requestedGeneration,
      }))
    const targetDecision = this.decideTarget({
      currentGeneration: membership.requestedGeneration,
      activeDocumentIndexId: membership.activeDocumentIndexId,
      targetDocumentIndexId: lockedTargetIndex.id,
      targetIndexStatus: lockedTargetIndex.status,
      currentJob,
      hasUnretriedFailure: hasCurrentUnretriedFailure,
    })

    if (targetDecision.targetState === RagIndexTargetStateEnum.READY) {
      await transaction.updateMembershipRequest({
        knowledgeBaseId: input.knowledgeBaseId,
        documentId,
        requestedGeneration: targetDecision.generation,
        activeDocumentIndexId: lockedTargetIndex.id,
      })
      await transaction.updateIndexUnreferencedSince(lockedTargetIndex.id, null)

      if (currentJob) await transaction.removeCurrentJob(currentJob.id)

      if (membership.activeDocumentIndexId && membership.activeDocumentIndexId !== lockedTargetIndex.id)
        await transaction.updateIndexUnreferencedSince(membership.activeDocumentIndexId, new Date())

      return {
        documentId,
        revisionId,
        documentIndexId: lockedTargetIndex.id,
        jobId: null,
        generation: targetDecision.generation,
        reusedReadyIndex: true,
        blockedByFailedJob: false,
      }
    }

    if (
      targetDecision.targetState === RagIndexTargetStateEnum.QUEUED ||
      targetDecision.targetState === RagIndexTargetStateEnum.BUILDING
    ) {
      return {
        documentId,
        revisionId,
        documentIndexId: lockedTargetIndex.id,
        jobId: currentJob?.id ?? null,
        generation: targetDecision.generation,
        reusedReadyIndex: false,
        blockedByFailedJob: false,
      }
    }

    if (targetDecision.targetState === RagIndexTargetStateEnum.FAILED_BLOCKED) {
      return {
        documentId,
        revisionId,
        documentIndexId: lockedTargetIndex.id,
        jobId: null,
        generation: targetDecision.generation,
        reusedReadyIndex: false,
        blockedByFailedJob: true,
      }
    }

    const requestedGeneration = targetDecision.generation
    const hasRequestedGenerationFailure = await transaction.hasUnretriedFailure({
      knowledgeBaseId: input.knowledgeBaseId,
      documentId,
      documentIndexId: lockedTargetIndex.id,
      generation: requestedGeneration,
    })
    const enqueueDecision = this.decideEnqueue({
      currentGeneration: membership.requestedGeneration,
      requestedGeneration,
      targetDocumentIndexId: lockedTargetIndex.id,
      currentJob,
      hasUnretriedFailure: hasRequestedGenerationFailure,
    })

    if (enqueueDecision.kind === RAG_INDEX_REQUEST_OUTCOME_KINDS.reuse) {
      return {
        documentId,
        revisionId,
        documentIndexId: lockedTargetIndex.id,
        jobId: enqueueDecision.jobId,
        generation: enqueueDecision.generation,
        reusedReadyIndex: false,
        blockedByFailedJob: false,
      }
    }

    if (enqueueDecision.kind === RAG_INDEX_REQUEST_OUTCOME_KINDS.blocked) {
      return {
        documentId,
        revisionId,
        documentIndexId: lockedTargetIndex.id,
        jobId: null,
        generation: enqueueDecision.generation,
        reusedReadyIndex: false,
        blockedByFailedJob: true,
      }
    }

    if (currentJob) await transaction.removeCurrentJob(currentJob.id)

    await transaction.updateMembershipRequest({
      knowledgeBaseId: input.knowledgeBaseId,
      documentId,
      requestedGeneration: enqueueDecision.generation,
      activeDocumentIndexId: membership.activeDocumentIndexId,
    })
    const { jobId } = await transaction.enqueueJob({
      knowledgeBaseId: input.knowledgeBaseId,
      documentId,
      documentIndexId: lockedTargetIndex.id,
      generation: enqueueDecision.generation,
      status: RAG_JOB_STATUS.QUEUED,
      attempts: 0,
      availableAt: new Date(),
      payload: input.payload ?? {},
    })

    return {
      documentId,
      revisionId,
      documentIndexId: lockedTargetIndex.id,
      jobId,
      generation: enqueueDecision.generation,
      reusedReadyIndex: false,
      blockedByFailedJob: false,
    }
  }

  private decideTarget(input: {
    currentGeneration: number
    activeDocumentIndexId: string | null
    targetDocumentIndexId: string
    targetIndexStatus: RagDocumentIndexStatus
    currentJob: CurrentIndexJob
    hasUnretriedFailure: boolean
  }): TargetDecision {
    if (input.targetIndexStatus === RAG_DOCUMENT_INDEX_STATUS.READY) {
      const generationChanged =
        input.activeDocumentIndexId !== input.targetDocumentIndexId ||
        (input.currentJob?.generation === input.currentGeneration &&
          input.currentJob.documentIndexId !== input.targetDocumentIndexId)

      return {
        targetState: RagIndexTargetStateEnum.READY,
        generation: input.currentGeneration + Number(generationChanged),
      }
    }

    const targetJob =
      input.currentJob?.documentIndexId === input.targetDocumentIndexId &&
      input.currentJob.generation === input.currentGeneration
        ? input.currentJob
        : null

    if (targetJob) {
      return {
        targetState: RagDocumentIndex.targetState(input.targetIndexStatus, targetJob.status, input.hasUnretriedFailure),
        generation: input.currentGeneration,
      }
    }

    if (input.hasUnretriedFailure) {
      return {
        targetState: RagDocumentIndex.targetState(input.targetIndexStatus, null, true),
        generation: input.currentGeneration,
      }
    }

    return { targetState: RagIndexTargetStateEnum.NEEDS_INDEX, generation: input.currentGeneration + 1 }
  }

  private decideEnqueue(input: {
    currentGeneration: number
    requestedGeneration: number
    targetDocumentIndexId: string
    currentJob: CurrentIndexJob
    hasUnretriedFailure: boolean
  }): EnqueueDecision {
    if (
      input.currentJob?.documentIndexId === input.targetDocumentIndexId &&
      input.currentJob.generation === input.currentGeneration
    ) {
      return {
        kind: RAG_INDEX_REQUEST_OUTCOME_KINDS.reuse,
        jobId: input.currentJob.id,
        generation: input.currentGeneration,
      }
    }

    if (input.hasUnretriedFailure)
      return { kind: RAG_INDEX_REQUEST_OUTCOME_KINDS.blocked, generation: input.requestedGeneration }

    return { kind: RAG_INDEX_REQUEST_OUTCOME_KINDS.enqueue, generation: input.requestedGeneration }
  }
}
