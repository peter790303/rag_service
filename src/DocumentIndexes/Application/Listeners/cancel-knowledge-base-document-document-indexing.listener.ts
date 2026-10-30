import { concatMap, from, lastValueFrom, toArray } from 'rxjs'

import type { KnowledgeBaseDocumentPruningStartedEvent } from '../../../KnowledgeBaseDocuments/Application/Events/knowledge-base-document-pruning-started.event.ts'
import { KnowledgeBaseDocumentPruneConflictException } from '../../../KnowledgeBaseDocuments/Domain/Exceptions/knowledge-base-document-prune-conflict.exception.ts'
import { PruningDocumentIndexAssembler } from '../Assemblers/pruning-document-index.assembler.ts'
import type { DocumentIndexExecutionQueue } from '../Ports/Out/Gateways/document-index-execution.queue.ts'

/** Cancels indexing work after a KnowledgeBaseDocuments pruning fact is delivered within the same transaction. */
export class CancelKnowledgeBaseDocumentDocumentIndexingListener {
  constructor(private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue) {}

  async handle(event: KnowledgeBaseDocumentPruningStartedEvent): Promise<readonly string[]> {
    const jobs = (
      await this.documentIndexExecutionQueue.findKnowledgeBaseDocumentExecutions(
        PruningDocumentIndexAssembler.toDocumentIndexExecutionsForKnowledgeBaseDocumentParams(event),
      )
    ).sort((left, right) => left.id.localeCompare(right.id))
    const detachedIndexIds = new Set<string>()

    const cancelJob = async (job: (typeof jobs)[number]): Promise<void> => {
      const lockedJob = await this.documentIndexExecutionQueue.lockExecution(
        PruningDocumentIndexAssembler.toDocumentIndexExecutionIdParams(job.id),
      )

      if (lockedJob === null) return

      if (
        lockedJob.id !== job.id ||
        lockedJob.knowledgeBaseId !== event.knowledgeBaseId ||
        lockedJob.documentId !== event.documentId
      )
        throw new KnowledgeBaseDocumentPruneConflictException(event.knowledgeBaseId, event.documentId)

      await this.documentIndexExecutionQueue.releaseExecution(
        PruningDocumentIndexAssembler.toDocumentIndexExecutionIdParams(lockedJob.id),
      )
      detachedIndexIds.add(lockedJob.documentIndexId)
    }

    await lastValueFrom(from(jobs).pipe(concatMap(cancelJob), toArray()))

    return [...detachedIndexIds]
  }
}
