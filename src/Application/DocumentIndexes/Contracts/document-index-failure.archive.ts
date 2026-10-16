import type { DocumentIndexFailureRecordDto } from '../DataTransferObjects/document-index-failure-record.dto.ts'
import type { ExpiredDocumentIndexFailureDto } from '../DataTransferObjects/expired-document-index-failure.dto.ts'
import type {
  DocumentIndexFailureDocumentQueryObject,
  ExpiredDocumentIndexFailuresQueryObject,
  DocumentIndexFailureIdQueryObject,
  DocumentIndexFailureInProjectQueryObject,
  DocumentIndexFailureIndexQueryObject,
  DocumentIndexFailureLookupQueryObject,
  MarkDocumentIndexFailureRetriedQueryObject,
  ArchiveDocumentIndexFailureQueryObject,
  UnretriedDocumentIndexFailureTargetQueryObject,
} from '../QueryObjects/document-index-failure.query-object.ts'

/** Execution failure history owned by document-index listeners. */
export abstract class DocumentIndexFailureArchive {
  abstract archive(failure: ArchiveDocumentIndexFailureQueryObject): Promise<DocumentIndexFailureRecordDto>

  abstract lockFailure(failure: DocumentIndexFailureIdQueryObject): Promise<DocumentIndexFailureRecordDto | null>

  abstract findFailure(failure: DocumentIndexFailureLookupQueryObject): Promise<DocumentIndexFailureRecordDto | null>

  abstract findFailureInProject(
    failure: DocumentIndexFailureInProjectQueryObject,
  ): Promise<DocumentIndexFailureRecordDto | null>

  abstract findUnretriedTargetFailure(
    target: UnretriedDocumentIndexFailureTargetQueryObject,
  ): Promise<DocumentIndexFailureRecordDto | null>

  abstract markRetried(failure: MarkDocumentIndexFailureRetriedQueryObject): Promise<void>

  abstract countDocumentFailures(document: DocumentIndexFailureDocumentQueryObject): Promise<number>

  abstract countIndexFailures(index: DocumentIndexFailureIndexQueryObject): Promise<number>

  abstract findExpiredFailures(
    expiration: ExpiredDocumentIndexFailuresQueryObject,
  ): Promise<ExpiredDocumentIndexFailureDto[]>

  abstract lockExpiredFailure(
    failure: DocumentIndexFailureIdQueryObject,
  ): Promise<ExpiredDocumentIndexFailureDto | null>

  abstract removeExpiredFailure(failure: DocumentIndexFailureIdQueryObject): Promise<void>
}
