import { KnowledgeMembershipPruneConflictException } from '../../../Domain/Membership/Exceptions/knowledge-membership-prune-conflict.exception.ts'
import { PruningDocumentIndexAssembler } from '../../DocumentIndexes/Assemblers/pruning-document-index.assembler.ts'
import type { DocumentIndexExecutionQueue } from '../../DocumentIndexes/Contracts/document-index-execution.queue.ts'
import type { MembershipPruningRequestedEvent } from '../Events/membership-pruning-requested.event.ts'

export class CancelMembershipIndexingListener {
  constructor(private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue) {}

  async handle(event: MembershipPruningRequestedEvent): Promise<readonly string[]> {
    const jobs = (
      await this.documentIndexExecutionQueue.findMembershipExecutions(
        PruningDocumentIndexAssembler.toDocumentIndexExecutionsForMembershipQueryObject(event),
      )
    ).sort((left, right) => left.id.localeCompare(right.id))
    const detachedIndexIds = new Set<string>()

    await jobs.reduce(async (previous, job) => {
      await previous
      const lockedJob = await this.documentIndexExecutionQueue.lockExecution(
        PruningDocumentIndexAssembler.toDocumentIndexExecutionIdQueryObject(job.id),
      )

      if (lockedJob === null) return

      if (
        lockedJob.id !== job.id ||
        lockedJob.knowledgeBaseId !== event.knowledgeBaseId ||
        lockedJob.documentId !== event.documentId
      )
        throw new KnowledgeMembershipPruneConflictException(event.knowledgeBaseId, event.documentId)

      await this.documentIndexExecutionQueue.releaseExecution(
        PruningDocumentIndexAssembler.toDocumentIndexExecutionIdQueryObject(lockedJob.id),
      )
      detachedIndexIds.add(lockedJob.documentIndexId)
    }, Promise.resolve())

    return [...detachedIndexIds]
  }
}
