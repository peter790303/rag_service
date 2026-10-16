import type { DocumentIndexExecutionFactsDto } from '../DataTransferObjects/document-index-execution-facts.dto.ts'
import type { DocumentIndexExecutionRecordDto } from '../DataTransferObjects/document-index-execution-record.dto.ts'
import type {
  EnqueueDocumentIndexingRetryQueryObject,
  ExpiredDocumentIndexExecutionQueryObject,
  ExpiredDocumentIndexExecutionsQueryObject,
  DocumentIndexExecutionDocumentQueryObject,
  DocumentIndexExecutionMembershipQueryObject,
  DocumentIndexExecutionIdQueryObject,
  DocumentIndexExecutionInProjectQueryObject,
  DocumentIndexExecutionIndexQueryObject,
  DocumentIndexExecutionRetrySourceQueryObject,
  DocumentIndexExecutionsForMembershipQueryObject,
  AvailableDocumentIndexExecutionQueryObject,
  OldestAvailableDocumentIndexExecutionQueryObject,
  AvailableDocumentIndexExecutionsQueryObject,
  RunningDocumentIndexExecutionSiblingsQueryObject,
  RenewDocumentIndexExecutionLeaseQueryObject,
  RescheduleDocumentIndexExecutionQueryObject,
  EnqueueDocumentIndexExecutionQueryObject,
  TransitionDocumentIndexExecutionQueryObject,
} from '../QueryObjects/document-index-execution.query-object.ts'

/** Durable delivery and lease capabilities owned by document-index listeners. */
export abstract class DocumentIndexExecutionQueue {
  abstract enqueue(queuedExecution: EnqueueDocumentIndexExecutionQueryObject): Promise<DocumentIndexExecutionRecordDto>

  abstract enqueueRetry(
    retryExecution: EnqueueDocumentIndexingRetryQueryObject,
  ): Promise<DocumentIndexExecutionRecordDto>

  abstract lockExecution(
    execution: DocumentIndexExecutionIdQueryObject,
  ): Promise<DocumentIndexExecutionRecordDto | null>

  abstract lockMembershipExecution(
    membership: DocumentIndexExecutionMembershipQueryObject,
  ): Promise<DocumentIndexExecutionRecordDto | null>

  abstract findMembershipExecution(
    membership: DocumentIndexExecutionMembershipQueryObject,
  ): Promise<DocumentIndexExecutionRecordDto | null>

  abstract findMembershipExecutions(
    membership: DocumentIndexExecutionsForMembershipQueryObject,
  ): Promise<DocumentIndexExecutionRecordDto[]>

  abstract findExecutionInProject(
    execution: DocumentIndexExecutionInProjectQueryObject,
  ): Promise<DocumentIndexExecutionRecordDto | null>

  abstract renewLease(heartbeat: RenewDocumentIndexExecutionLeaseQueryObject): Promise<void>

  abstract rescheduleExecution(execution: RescheduleDocumentIndexExecutionQueryObject): Promise<void>

  abstract releaseExecution(execution: DocumentIndexExecutionIdQueryObject): Promise<void>

  abstract countDocumentExecutions(document: DocumentIndexExecutionDocumentQueryObject): Promise<number>

  abstract countIndexExecutions(index: DocumentIndexExecutionIndexQueryObject): Promise<number>

  abstract countFailureRetries(failure: DocumentIndexExecutionRetrySourceQueryObject): Promise<number>

  abstract findExpiredExecutions(
    expiration: ExpiredDocumentIndexExecutionsQueryObject,
  ): Promise<DocumentIndexExecutionRecordDto[]>

  abstract lockExpiredExecution(
    expiration: ExpiredDocumentIndexExecutionQueryObject,
  ): Promise<DocumentIndexExecutionRecordDto | null>

  abstract countAvailableExecutions(availability: AvailableDocumentIndexExecutionsQueryObject): Promise<number>

  abstract findOldestAvailableExecution(
    availability: OldestAvailableDocumentIndexExecutionQueryObject,
  ): Promise<DocumentIndexExecutionRecordDto | null>

  abstract lockAvailableExecution(
    availability: AvailableDocumentIndexExecutionQueryObject,
  ): Promise<DocumentIndexExecutionRecordDto | null>

  abstract findSiblingExecutions(
    execution: RunningDocumentIndexExecutionSiblingsQueryObject,
  ): Promise<DocumentIndexExecutionFactsDto[]>

  abstract transitionExecution(transition: TransitionDocumentIndexExecutionQueryObject): Promise<boolean>

  abstract releaseQueuedExecution(execution: DocumentIndexExecutionIdQueryObject): Promise<boolean>

  abstract releaseRunningExecution(execution: DocumentIndexExecutionIdQueryObject): Promise<void>
}
