import { concatMap, filter, firstValueFrom, from, toArray } from 'rxjs'

import type { CollectDocumentIndexFailureGarbageCommand } from '../Commands/collect-document-index-failure-garbage.command.ts'
import type { CollectDocumentIndexFailureGarbageCommandHandlerContract } from '../Contracts/collect-document-index-failure-garbage.command.handler.contract.ts'
import type { ExpiredDocumentIndexFailureDTO } from '../DTOs/expired-document-index-failure.dto.ts'
import type { DocumentIndexExecutionQueue } from '../Ports/Out/Gateways/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../Ports/Out/Gateways/document-index-failure.archive.ts'

export class CollectDocumentIndexFailureGarbageCommandHandler implements CollectDocumentIndexFailureGarbageCommandHandlerContract {
  constructor(
    private readonly executionQueue: DocumentIndexExecutionQueue,
    private readonly failureArchive: DocumentIndexFailureArchive,
  ) {}

  async execute({
    scope,
    candidates,
  }: CollectDocumentIndexFailureGarbageCommand): Promise<ExpiredDocumentIndexFailureDTO[]> {
    const orderedCandidates = [...candidates].sort((left, right) => left.failedJobId.localeCompare(right.failedJobId))
    const collect = async (
      candidate: ExpiredDocumentIndexFailureDTO,
    ): Promise<ExpiredDocumentIndexFailureDTO | null> => {
      if (!scope.lockedDocumentIds.includes(candidate.documentId)) return null

      const failure = await this.failureArchive.lockExpiredFailure({ failedJobId: candidate.failedJobId })

      if (!failure || failure.failedAt.getTime() > scope.retentionCutoff.getTime()) return null

      if (failure.failedJobId !== candidate.failedJobId || failure.documentId !== candidate.documentId) return null

      if ((await this.executionQueue.countFailureRetries({ failedJobId: failure.failedJobId })) > 0) return null

      await this.failureArchive.removeExpiredFailure({ failedJobId: failure.failedJobId })

      return failure
    }
    const wasCollected = (failure: ExpiredDocumentIndexFailureDTO | null): failure is ExpiredDocumentIndexFailureDTO =>
      failure !== null

    return firstValueFrom(from(orderedCandidates).pipe(concatMap(collect), filter(wasCollected), toArray()))
  }
}
