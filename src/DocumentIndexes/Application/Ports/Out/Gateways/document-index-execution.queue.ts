import type {
  EnqueueDocumentIndexingRetryParams,
  ExpiredDocumentIndexExecutionParams,
  ExpiredDocumentIndexExecutionsParams,
  DocumentIndexExecutionDocumentParams,
  DocumentIndexExecutionKnowledgeBaseDocumentParams,
  DocumentIndexExecutionIdParams,
  DocumentIndexExecutionInProjectParams,
  DocumentIndexExecutionIndexParams,
  DocumentIndexExecutionRetrySourceParams,
  DocumentIndexExecutionsForKnowledgeBaseDocumentParams,
  AvailableDocumentIndexExecutionParams,
  OldestAvailableDocumentIndexExecutionParams,
  AvailableDocumentIndexExecutionsParams,
  RunningDocumentIndexExecutionSiblingsParams,
  RenewDocumentIndexExecutionLeaseParams,
  RescheduleDocumentIndexExecutionParams,
  EnqueueDocumentIndexExecutionParams,
  TransitionDocumentIndexExecutionParams,
} from './document-index-execution.params.ts'
import type { DocumentIndexExecutionFactsDTO } from '../../../DTOs/document-index-execution-facts.dto.ts'
import type { DocumentIndexExecutionRecordDTO } from '../../../DTOs/document-index-execution-record.dto.ts'

/** Durable delivery and lease capabilities owned by document-index listeners. */
export abstract class DocumentIndexExecutionQueue {
  abstract enqueue(queuedExecution: EnqueueDocumentIndexExecutionParams): Promise<void>

  abstract enqueueRetry(retryExecution: EnqueueDocumentIndexingRetryParams): Promise<void>

  abstract lockExecution(execution: DocumentIndexExecutionIdParams): Promise<DocumentIndexExecutionRecordDTO | null>

  abstract lockKnowledgeBaseDocumentExecution(
    knowledgeBaseDocument: DocumentIndexExecutionKnowledgeBaseDocumentParams,
  ): Promise<DocumentIndexExecutionRecordDTO | null>

  abstract findKnowledgeBaseDocumentExecution(
    knowledgeBaseDocument: DocumentIndexExecutionKnowledgeBaseDocumentParams,
  ): Promise<DocumentIndexExecutionRecordDTO | null>

  abstract findKnowledgeBaseDocumentExecutions(
    knowledgeBaseDocument: DocumentIndexExecutionsForKnowledgeBaseDocumentParams,
  ): Promise<DocumentIndexExecutionRecordDTO[]>

  abstract findExecutionInProject(
    execution: DocumentIndexExecutionInProjectParams,
  ): Promise<DocumentIndexExecutionRecordDTO | null>

  abstract renewLease(heartbeat: RenewDocumentIndexExecutionLeaseParams): Promise<void>

  abstract rescheduleExecution(execution: RescheduleDocumentIndexExecutionParams): Promise<void>

  abstract releaseExecution(execution: DocumentIndexExecutionIdParams): Promise<void>

  abstract countDocumentExecutions(document: DocumentIndexExecutionDocumentParams): Promise<number>

  abstract countIndexExecutions(index: DocumentIndexExecutionIndexParams): Promise<number>

  abstract countFailureRetries(failure: DocumentIndexExecutionRetrySourceParams): Promise<number>

  abstract findExpiredExecutions(
    expiration: ExpiredDocumentIndexExecutionsParams,
  ): Promise<DocumentIndexExecutionRecordDTO[]>

  abstract lockExpiredExecution(
    expiration: ExpiredDocumentIndexExecutionParams,
  ): Promise<DocumentIndexExecutionRecordDTO | null>

  abstract countAvailableExecutions(availability: AvailableDocumentIndexExecutionsParams): Promise<number>

  abstract findOldestAvailableExecution(
    availability: OldestAvailableDocumentIndexExecutionParams,
  ): Promise<DocumentIndexExecutionRecordDTO | null>

  abstract lockAvailableExecution(
    availability: AvailableDocumentIndexExecutionParams,
  ): Promise<DocumentIndexExecutionRecordDTO | null>

  abstract findSiblingExecutions(
    execution: RunningDocumentIndexExecutionSiblingsParams,
  ): Promise<DocumentIndexExecutionFactsDTO[]>

  abstract transitionExecution(transition: TransitionDocumentIndexExecutionParams): Promise<boolean>

  abstract releaseQueuedExecution(execution: DocumentIndexExecutionIdParams): Promise<boolean>

  abstract releaseRunningExecution(execution: DocumentIndexExecutionIdParams): Promise<void>
}
