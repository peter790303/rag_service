import { concatMap, lastValueFrom, takeWhile, timer } from 'rxjs'

import { DocumentIndexingRequestedEvent } from '../../../Application/DocumentIndexes/Events/document-indexing-requested.event.ts'
import { DocumentIndexingRequestedListener } from '../../../Application/DocumentIndexes/Listeners/document-indexing-requested.listener.ts'
import { ReadDocumentIndexingStatusListener } from '../../../Application/DocumentIndexes/Listeners/read-document-indexing-status.listener.ts'
import { RetryDocumentIndexingListener } from '../../../Application/DocumentIndexes/Listeners/retry-document-indexing.listener.ts'
import type { SourceDocumentDTO } from '../../../Application/Documents/DataTransferObjects/source-document.dto.ts'

export class DocumentIndexImportCommand {
  constructor(
    private readonly requested: DocumentIndexingRequestedListener,
    private readonly readStatus: ReadDocumentIndexingStatusListener,
    private readonly retry: RetryDocumentIndexingListener,
  ) {}

  async requestAndWait(sourceDocument: SourceDocumentDTO, timeoutMs: number): Promise<void> {
    const result = await this.requested.handle(new DocumentIndexingRequestedEvent(sourceDocument))

    if (result.blockedByFailedJob) {
      const retryResult = await this.retry.retryCurrentTarget({
        projectId: sourceDocument.projectId,
        knowledgeBaseId: sourceDocument.knowledgeBaseId,
        documentId: result.documentId,
        documentIndexId: result.documentIndexId,
        generation: result.generation,
      })

      if (!retryResult.jobId) throw new Error(`Retry returned no indexing job: ${sourceDocument.sourcePath}`)

      await this.waitForJob(sourceDocument, retryResult.jobId, timeoutMs)

      return
    }

    if (result.reusedReadyIndex) return

    if (!result.jobId) throw new Error(`Index request returned no job for ${sourceDocument.sourcePath}`)

    await this.waitForJob(sourceDocument, result.jobId, timeoutMs)
  }

  private async waitForJob(sourceDocument: SourceDocumentDTO, jobId: string, timeoutMs: number): Promise<void> {
    const expiresAt = Date.now() + timeoutMs
    await lastValueFrom(
      timer(0, 500).pipe(
        concatMap(async () => {
          if (Date.now() >= expiresAt) throw new Error(`Timed out waiting for indexing: ${sourceDocument.sourcePath}`)

          const status = await this.readStatus.handle({ projectId: sourceDocument.projectId, jobId })
          const state = status.requestedTarget?.state ?? undefined

          if (state === 'ready') return true

          if (state === 'failed') {
            const errorCode = status.requestedTarget?.errorCode
            const errorMessage = status.requestedTarget?.errorMessage
            const diagnostics = [errorCode, errorMessage].filter(Boolean).join(': ')
            const detail = diagnostics ? `: ${diagnostics}` : ''
            throw new Error(
              `Index request failed for ${sourceDocument.sourcePath}${detail}. Check the indexing worker and its configured chunking and embedding providers.`,
            )
          }

          if (state === 'superseded' || state === undefined) {
            throw new Error(`Index request ended in ${state ?? 'missing'} state: ${sourceDocument.sourcePath}`)
          }

          if (state !== 'queued' && state !== 'running') {
            throw new Error(`Index request returned an unsupported state: ${state}`)
          }

          return false
        }),
        takeWhile((ready) => !ready, true),
      ),
    )
  }
}
