import { ReadLeaseDocumentIndexesAssembler } from './read-lease-document-indexes.assembler.ts'
import type { DocumentIndexExecutionRecordDTO } from '../DataTransferObjects/document-index-execution-record.dto.ts'
import type { ExpiredDocumentIndexExecutionDTO } from '../DataTransferObjects/expired-document-index-execution.dto.ts'
import type { DOCUMENT_INDEX_EXECUTION_STATUS } from '../Helpers/document-index-execution-lifecycle.helper.ts'
import type { DocumentIndexExecutionRetryFields } from '../Ports/Out/Gateways/document-index-execution.params.ts'
import type { ArchiveDocumentIndexFailureParams } from '../Ports/Out/Gateways/document-index-failure.params.ts'

/** Maps failed execution state to a queued retry or a failed-job archive. */
export class WriteFailDocumentIndexesAssembler {
  static toExpiredExecution(jobRecord: DocumentIndexExecutionRecordDTO): ExpiredDocumentIndexExecutionDTO {
    const leaseExpiresAt = ReadLeaseDocumentIndexesAssembler.toDocumentIndexExecutionLease(jobRecord).leaseExpiresAt

    return {
      id: jobRecord.id,
      knowledgeBaseId: jobRecord.knowledgeBaseId,
      documentId: jobRecord.documentId,
      documentIndexId: jobRecord.documentIndexId,
      generation: jobRecord.generation,
      attempts: jobRecord.attempts,
      payload: jobRecord.payload,
      executionState: jobRecord.executionState,
      leaseExpiresAt,
    }
  }

  static toFailedExecutionState(
    previousExecutionState: Record<string, unknown> | null,
    errorCode: string,
    errorMessage: string,
    failedAt: Date,
  ): Record<string, unknown> {
    const lastError = this.toExecutionLastError(errorCode, errorMessage, failedAt)

    if (!previousExecutionState) return { lastError }

    return { ...previousExecutionState, lastError }
  }

  static toDocumentIndexExecutionRetryWrite(
    status: typeof DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
    availableAt: Date,
    executionState: Record<string, unknown>,
  ): DocumentIndexExecutionRetryFields {
    return {
      status,
      availableAt,
      reservedAt: null,
      leaseToken: null,
      leaseExpiresAt: null,
      executionVerification: null,
      executionState,
    }
  }

  static toDocumentIndexFailureArchive(
    expiredJob: ExpiredDocumentIndexExecutionDTO,
    errorCode: string,
    errorMessage: string,
    executionState: Record<string, unknown>,
    failedAt: Date,
  ): ArchiveDocumentIndexFailureParams {
    const retryPayload = this.toArchivedExecutionRetryPayload(expiredJob.payload, executionState)

    return {
      jobId: expiredJob.id,
      knowledgeBaseId: expiredJob.knowledgeBaseId,
      documentId: expiredJob.documentId,
      documentIndexId: expiredJob.documentIndexId,
      generation: expiredJob.generation,
      attempts: expiredJob.attempts,
      errorCode,
      errorMessage,
      blockedReasons: [],
      retryPayload,
      failedAt,
      retriedAt: null,
    }
  }

  private static toExecutionLastError(
    errorCode: string,
    errorMessage: string,
    failedAt: Date,
  ): Record<string, unknown> {
    return { code: errorCode, message: errorMessage, failedAt: failedAt.toISOString() }
  }

  private static toArchivedExecutionRetryPayload(
    jobInput: Record<string, unknown>,
    executionState: Record<string, unknown>,
  ): Record<string, unknown> {
    return { format: 'rag-v1', input: jobInput, executionState }
  }
}
