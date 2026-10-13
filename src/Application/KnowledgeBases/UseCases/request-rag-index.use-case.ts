import { RagIndexTargetStateEnum } from '../../../Domain/Knowledge/Enums/rag-index-target-state.enum.js'
import { RagIndexingStore } from '../../../Infrastructure/Persistence/Repositories/Contracts/rag-indexing-store.js'
import type { RagIndexRequestResult, RagSourceDocumentDto } from '../DataTransferObjects/rag.dto.js'

/** Applies indexing policy to the current target before issuing persistence actions. */
export class RequestRagIndexUseCase {
  constructor(private readonly store: RagIndexingStore) {}

  async execute(input: RagSourceDocumentDto): Promise<RagIndexRequestResult> {
    const prepared = await this.store.prepareIndexRequest(input)

    if (prepared.targetState === RagIndexTargetStateEnum.READY)
      return this.store.activateReadyIndex({
        knowledgeBaseId: input.knowledgeBaseId,
        documentId: prepared.documentId,
        documentIndexId: prepared.documentIndexId,
        currentGeneration: prepared.currentGeneration,
      })

    if (
      prepared.targetState === RagIndexTargetStateEnum.QUEUED ||
      prepared.targetState === RagIndexTargetStateEnum.BUILDING
    )
      return {
        documentId: prepared.documentId,
        revisionId: prepared.revisionId,
        documentIndexId: prepared.documentIndexId,
        jobId: prepared.currentJobId,
        generation: prepared.currentGeneration,
        reusedReadyIndex: prepared.reusedReadyIndex,
        blockedByFailedJob: false,
      }

    if (prepared.targetState === RagIndexTargetStateEnum.FAILED_BLOCKED)
      return {
        documentId: prepared.documentId,
        revisionId: prepared.revisionId,
        documentIndexId: prepared.documentIndexId,
        jobId: prepared.currentJobId,
        generation: prepared.currentGeneration,
        reusedReadyIndex: prepared.reusedReadyIndex,
        blockedByFailedJob: true,
      }

    return this.store.enqueueIndex(input, prepared, prepared.currentGeneration + 1)
  }
}
