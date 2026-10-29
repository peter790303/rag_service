import assert from 'node:assert/strict'
import test from 'node:test'

import { DocumentIndexingRequestedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-indexing-requested.listener.ts'
import { ReadDocumentIndexingStatusListener } from '../../../src/Application/DocumentIndexes/Listeners/read-document-indexing-status.listener.ts'
import { RetryDocumentIndexingListener } from '../../../src/Application/DocumentIndexes/Listeners/retry-document-indexing.listener.ts'
import type { UnretriedDocumentIndexFailureTargetQueryObject } from '../../../src/Application/DocumentIndexes/QueryObjects/document-index-failure.query-object.ts'
import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import { DocumentIndexImportCommand } from '../../../src/Interfaces/Console/Commands/document-index-import-command.ts'

const sourceDocument = {
  knowledgeBaseId: 'kb-1',
  projectId: 'project-1',
  projectName: 'Project',
  sourceType: DocumentSourceTypeEnum.OBSIDIAN,
  sourceKey: 'file:///vault/note.md',
  sourcePath: '/vault/note.md',
  content: '# Note',
}

test('internal import submits through the application listener and waits for a ready result', async (context) => {
  const request = context.mock.fn(async () => ({ jobId: 'job-1', reusedReadyIndex: false }))
  let polls = 0
  const status = context.mock.fn(async () => {
    polls += 1

    return { requestedTarget: { state: polls === 1 ? 'queued' : 'ready' } }
  })
  const command = new DocumentIndexImportCommand(
    { handle: request } as unknown as DocumentIndexingRequestedListener,
    { handle: status } as unknown as ReadDocumentIndexingStatusListener,
    {} as RetryDocumentIndexingListener,
  )

  await command.requestAndWait(sourceDocument, 2000)

  assert.equal(request.mock.callCount(), 1)
  assert.equal(status.mock.callCount(), 2)
})

test('internal import fails when the application reports a failed job', async (context) => {
  const request = context.mock.fn(async () => ({
    documentId: 'document-1',
    documentIndexId: 'index-1',
    generation: 'generation-1',
    jobId: 'job-2',
    reusedReadyIndex: false,
  }))
  const status = context.mock.fn(async () => ({
    requestedTarget: { state: 'failed' },
  }))
  const command = new DocumentIndexImportCommand(
    { handle: request } as unknown as DocumentIndexingRequestedListener,
    { handle: status } as unknown as ReadDocumentIndexingStatusListener,
    {} as RetryDocumentIndexingListener,
  )

  await assert.rejects(command.requestAndWait(sourceDocument, 2000), /indexing worker and its configured/)
})

test('internal import returns immediately when the formal request listener reuses a ready index', async (context) => {
  const request = context.mock.fn(async () => ({
    reusedReadyIndex: true,
  }))
  const status = context.mock.fn()
  const command = new DocumentIndexImportCommand(
    { handle: request } as unknown as DocumentIndexingRequestedListener,
    { handle: status } as unknown as ReadDocumentIndexingStatusListener,
    {} as RetryDocumentIndexingListener,
  )

  await command.requestAndWait(sourceDocument, 2000)

  assert.equal(request.mock.callCount(), 1)
  assert.equal(status.mock.callCount(), 0)
})

test('internal import retries an unretried failure through the retry listener and waits for completed indexing', async (context) => {
  const request = context.mock.fn(async () => ({
    documentId: 'document-1',
    documentIndexId: 'index-1',
    generation: 'generation-1',
    jobId: null,
    reusedReadyIndex: false,
    blockedByFailedJob: true,
  }))
  const retry = context.mock.fn(
    async (target: UnretriedDocumentIndexFailureTargetQueryObject & { readonly projectId: string }) => {
      assert.ok(target)

      return { jobId: 'retry-job-1' }
    },
  )
  const status = context.mock.fn(async () => ({ requestedTarget: { state: 'ready' } }))
  const command = new DocumentIndexImportCommand(
    { handle: request } as unknown as DocumentIndexingRequestedListener,
    { handle: status } as unknown as ReadDocumentIndexingStatusListener,
    { retryCurrentTarget: retry } as unknown as RetryDocumentIndexingListener,
  )

  await command.requestAndWait(sourceDocument, 2000)

  assert.deepEqual(retry.mock.calls[0]?.arguments[0], {
    projectId: sourceDocument.projectId,
    knowledgeBaseId: sourceDocument.knowledgeBaseId,
    documentId: 'document-1',
    documentIndexId: 'index-1',
    generation: 'generation-1',
  })
  assert.equal(status.mock.callCount(), 1)
})

test('internal import reports indexing provider diagnostics when indexing fails', async (context) => {
  const request = context.mock.fn(async () => ({ jobId: 'job-3', reusedReadyIndex: false }))
  const status = context.mock.fn(async () => ({
    requestedTarget: {
      state: 'failed',
      errorCode: 'INDEXING_FAILED',
      errorMessage: 'Semantic chunk planning is unavailable',
    },
  }))
  const command = new DocumentIndexImportCommand(
    { handle: request } as unknown as DocumentIndexingRequestedListener,
    { handle: status } as unknown as ReadDocumentIndexingStatusListener,
    {} as RetryDocumentIndexingListener,
  )

  await assert.rejects(
    command.requestAndWait(sourceDocument, 2000),
    /Semantic chunk planning is unavailable.*configured chunking and embedding providers/,
  )
})
