import type { Document } from '../../../Domain/Document/document.ts'
import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'
import type { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import type { DocumentIndexExecutionRecordDTO } from '../DataTransferObjects/document-index-execution-record.dto.ts'
import type { DocumentIndexFailureRecordDTO } from '../DataTransferObjects/document-index-failure-record.dto.ts'
import type { DocumentIndexingRetryContext } from '../DataTransferObjects/document-indexing-retry-context.dto.ts'

export class ReadRetryDocumentIndexesAssembler {
  static toDocumentIndexingRetryContext(retryContextRecords: {
    failedJob: DocumentIndexFailureRecordDTO
    knowledgeBase: Pick<KnowledgeBase, 'id' | 'projectId'>
    document: Document | null
    knowledgeBaseDocument: KnowledgeBaseDocument | null
    index: DocumentIndex | null
    activeJob: DocumentIndexExecutionRecordDTO | null
    targetRevision: DocumentRevision | null
  }): DocumentIndexingRetryContext {
    const failedJob = this.toRetryDocumentIndexingResult(retryContextRecords.failedJob)
    const knowledgeBase = retryContextRecords.knowledgeBase
    const targetRevision = retryContextRecords.targetRevision
    const sourceDocument = this.toRetryDocument(retryContextRecords.document, targetRevision)
    const knowledgeBaseDocument = retryContextRecords.knowledgeBaseDocument
    const documentIndex = this.toRetryDocumentIndex(retryContextRecords.index)
    const activeJob = this.toRetryActiveExecution(retryContextRecords.activeJob)

    return {
      failedJob: failedJob,
      knowledgeBase,
      document: sourceDocument,
      knowledgeBaseDocument,
      documentIndex,
      activeJob: activeJob,
    }
  }

  private static toRetryDocumentIndexingResult(
    failedJobRecord: DocumentIndexFailureRecordDTO,
  ): DocumentIndexingRetryContext['failedJob'] {
    const generation = failedJobRecord.generation
    const retryPayload = this.toExecutionRetryPayload(failedJobRecord.retryPayload)

    return {
      id: failedJobRecord.id,
      knowledgeBaseId: failedJobRecord.knowledgeBaseId,
      documentId: failedJobRecord.documentId,
      documentIndexId: failedJobRecord.documentIndexId,
      generation,
      attempts: failedJobRecord.attempts,
      retryOfFailedJobId: null,
      retriedAt: failedJobRecord.retriedAt,
      retryPayload,
    }
  }

  private static toExecutionRetryPayload(
    archivedRetryPayload: Record<string, unknown>,
  ): DocumentIndexingRetryContext['failedJob']['retryPayload'] {
    const retryInput = archivedRetryPayload.input

    if (archivedRetryPayload.format !== 'rag-v1') {
      return { input: archivedRetryPayload, executionState: null }
    }

    const rawExecutionState = archivedRetryPayload.executionState
    let executionState = null

    if (rawExecutionState !== null && typeof rawExecutionState === 'object' && !Array.isArray(rawExecutionState)) {
      executionState = rawExecutionState as Record<string, unknown>
    }

    return { input: retryInput as Record<string, unknown>, executionState }
  }

  private static toRetryDocument(
    documentRecord: Document | null,
    targetRevision: NonNullable<DocumentIndexingRetryContext['document']>['targetRevision'],
  ): DocumentIndexingRetryContext['document'] {
    if (documentRecord === null) return null

    return {
      id: documentRecord.id,
      sourceType: documentRecord.sourceType,
      sourceKey: documentRecord.sourceKey,
      sourcePath: documentRecord.sourcePath,
      currentTitle: documentRecord.currentTitle,
      targetRevision,
    }
  }

  private static toRetryDocumentIndex(
    restoredDocumentIndexDTO: DocumentIndex | null,
  ): DocumentIndexingRetryContext['documentIndex'] {
    if (restoredDocumentIndexDTO === null) return null

    return {
      id: restoredDocumentIndexDTO.id,
      documentRevisionId: restoredDocumentIndexDTO.revisionId,
      pipelineHash: restoredDocumentIndexDTO.pipelineHash,
      status: restoredDocumentIndexDTO.status,
      readyAt: restoredDocumentIndexDTO.readyAt?.nativeDate ?? null,
    }
  }

  private static toRetryActiveExecution(
    activeJobRecord: DocumentIndexExecutionRecordDTO | null,
  ): DocumentIndexingRetryContext['activeJob'] {
    if (activeJobRecord === null) return null

    return { id: activeJobRecord.id, status: activeJobRecord.status }
  }
}
