import type { DocumentIndexFailureRecordDTO } from '../DataTransferObjects/document-index-failure-record.dto.ts'
import type { ExpiredDocumentIndexFailureDTO } from '../DataTransferObjects/expired-document-index-failure.dto.ts'
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
  abstract archive(failure: ArchiveDocumentIndexFailureQueryObject): Promise<void>

  abstract lockFailure(failure: DocumentIndexFailureIdQueryObject): Promise<DocumentIndexFailureRecordDTO | null>

  abstract findFailure(failure: DocumentIndexFailureLookupQueryObject): Promise<DocumentIndexFailureRecordDTO | null>

  abstract findFailureInProject(
    failure: DocumentIndexFailureInProjectQueryObject,
  ): Promise<DocumentIndexFailureRecordDTO | null>

  abstract findUnretriedTargetFailure(
    target: UnretriedDocumentIndexFailureTargetQueryObject,
  ): Promise<DocumentIndexFailureRecordDTO | null>

  abstract markRetried(failure: MarkDocumentIndexFailureRetriedQueryObject): Promise<void>

  abstract countDocumentFailures(document: DocumentIndexFailureDocumentQueryObject): Promise<number>

  abstract countIndexFailures(index: DocumentIndexFailureIndexQueryObject): Promise<number>

  abstract findExpiredFailures(
    expiration: ExpiredDocumentIndexFailuresQueryObject,
  ): Promise<ExpiredDocumentIndexFailureDTO[]>

  abstract lockExpiredFailure(
    failure: DocumentIndexFailureIdQueryObject,
  ): Promise<ExpiredDocumentIndexFailureDTO | null>

  abstract removeExpiredFailure(failure: DocumentIndexFailureIdQueryObject): Promise<void>
}
