import type { DocumentIndexExecutionFactsDTO } from '../../../DataTransferObjects/document-index-execution-facts.dto.ts'
import type { DocumentIndexExecutionRecordDTO } from '../../../DataTransferObjects/document-index-execution-record.dto.ts'
import type {
  EnqueueDocumentIndexingRetryQueryObject,
  ExpiredDocumentIndexExecutionQueryObject,
  ExpiredDocumentIndexExecutionsQueryObject,
  DocumentIndexExecutionDocumentQueryObject,
  DocumentIndexExecutionKnowledgeBaseDocumentQueryObject,
  DocumentIndexExecutionIdQueryObject,
  DocumentIndexExecutionInProjectQueryObject,
  DocumentIndexExecutionIndexQueryObject,
  DocumentIndexExecutionRetrySourceQueryObject,
  DocumentIndexExecutionsForKnowledgeBaseDocumentQueryObject,
  AvailableDocumentIndexExecutionQueryObject,
  OldestAvailableDocumentIndexExecutionQueryObject,
  AvailableDocumentIndexExecutionsQueryObject,
  RunningDocumentIndexExecutionSiblingsQueryObject,
  RenewDocumentIndexExecutionLeaseQueryObject,
  RescheduleDocumentIndexExecutionQueryObject,
  EnqueueDocumentIndexExecutionQueryObject,
  TransitionDocumentIndexExecutionQueryObject,
} from '../../../QueryObjects/document-index-execution.query-object.ts'

/** Durable delivery and lease capabilities owned by document-index listeners. */
export abstract class DocumentIndexExecutionQueue {
  abstract enqueue(queuedExecution: EnqueueDocumentIndexExecutionQueryObject): Promise<void>

  abstract enqueueRetry(retryExecution: EnqueueDocumentIndexingRetryQueryObject): Promise<void>

  abstract lockExecution(
    execution: DocumentIndexExecutionIdQueryObject,
  ): Promise<DocumentIndexExecutionRecordDTO | null>

  abstract lockKnowledgeBaseDocumentExecution(
    knowledgeBaseDocument: DocumentIndexExecutionKnowledgeBaseDocumentQueryObject,
  ): Promise<DocumentIndexExecutionRecordDTO | null>

  abstract findKnowledgeBaseDocumentExecution(
    knowledgeBaseDocument: DocumentIndexExecutionKnowledgeBaseDocumentQueryObject,
  ): Promise<DocumentIndexExecutionRecordDTO | null>

  abstract findKnowledgeBaseDocumentExecutions(
    knowledgeBaseDocument: DocumentIndexExecutionsForKnowledgeBaseDocumentQueryObject,
  ): Promise<DocumentIndexExecutionRecordDTO[]>

  abstract findExecutionInProject(
    execution: DocumentIndexExecutionInProjectQueryObject,
  ): Promise<DocumentIndexExecutionRecordDTO | null>

  abstract renewLease(heartbeat: RenewDocumentIndexExecutionLeaseQueryObject): Promise<void>

  abstract rescheduleExecution(execution: RescheduleDocumentIndexExecutionQueryObject): Promise<void>

  abstract releaseExecution(execution: DocumentIndexExecutionIdQueryObject): Promise<void>

  abstract countDocumentExecutions(document: DocumentIndexExecutionDocumentQueryObject): Promise<number>

  abstract countIndexExecutions(index: DocumentIndexExecutionIndexQueryObject): Promise<number>

  abstract countFailureRetries(failure: DocumentIndexExecutionRetrySourceQueryObject): Promise<number>

  abstract findExpiredExecutions(
    expiration: ExpiredDocumentIndexExecutionsQueryObject,
  ): Promise<DocumentIndexExecutionRecordDTO[]>

  abstract lockExpiredExecution(
    expiration: ExpiredDocumentIndexExecutionQueryObject,
  ): Promise<DocumentIndexExecutionRecordDTO | null>

  abstract countAvailableExecutions(availability: AvailableDocumentIndexExecutionsQueryObject): Promise<number>

  abstract findOldestAvailableExecution(
    availability: OldestAvailableDocumentIndexExecutionQueryObject,
  ): Promise<DocumentIndexExecutionRecordDTO | null>

  abstract lockAvailableExecution(
    availability: AvailableDocumentIndexExecutionQueryObject,
  ): Promise<DocumentIndexExecutionRecordDTO | null>

  abstract findSiblingExecutions(
    execution: RunningDocumentIndexExecutionSiblingsQueryObject,
  ): Promise<DocumentIndexExecutionFactsDTO[]>

  abstract transitionExecution(transition: TransitionDocumentIndexExecutionQueryObject): Promise<boolean>

  abstract releaseQueuedExecution(execution: DocumentIndexExecutionIdQueryObject): Promise<boolean>

  abstract releaseRunningExecution(execution: DocumentIndexExecutionIdQueryObject): Promise<void>
}
