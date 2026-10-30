import type {
  DocumentIndexFailureDocumentParams,
  ExpiredDocumentIndexFailuresParams,
  DocumentIndexFailureIdParams,
  DocumentIndexFailureInProjectParams,
  DocumentIndexFailureIndexParams,
  DocumentIndexFailureLookupParams,
  ArchiveDocumentIndexFailureParams,
  UnretriedDocumentIndexFailureTargetParams,
  UnretriedDocumentIndexFailuresParams,
} from './document-index-failure.params.ts'
import type { DocumentIndexFailureRecordDTO } from '../../../DataTransferObjects/document-index-failure-record.dto.ts'
import type { ExpiredDocumentIndexFailureDTO } from '../../../DataTransferObjects/expired-document-index-failure.dto.ts'

/** Execution failure history owned by document-index listeners. */
export abstract class DocumentIndexFailureArchive {
  abstract archive(failure: ArchiveDocumentIndexFailureParams): Promise<void>

  abstract lockFailure(failure: DocumentIndexFailureIdParams): Promise<DocumentIndexFailureRecordDTO | null>

  abstract findFailure(failure: DocumentIndexFailureLookupParams): Promise<DocumentIndexFailureRecordDTO | null>

  abstract findFailureInProject(
    failure: DocumentIndexFailureInProjectParams,
  ): Promise<DocumentIndexFailureRecordDTO | null>

  abstract findUnretriedTargetFailure(
    target: UnretriedDocumentIndexFailureTargetParams,
  ): Promise<DocumentIndexFailureRecordDTO | null>

  abstract findByRetriedAtIsNullAndFailedAtLessThanOrEqualCutoffOrderByFailedAtAscAndIdAsc(
    query: UnretriedDocumentIndexFailuresParams,
  ): Promise<string[]>

  abstract removeFailure(failure: DocumentIndexFailureIdParams): Promise<void>

  abstract countDocumentFailures(document: DocumentIndexFailureDocumentParams): Promise<number>

  abstract countIndexFailures(index: DocumentIndexFailureIndexParams): Promise<number>

  abstract findExpiredFailures(
    expiration: ExpiredDocumentIndexFailuresParams,
  ): Promise<ExpiredDocumentIndexFailureDTO[]>

  abstract lockExpiredFailure(failure: DocumentIndexFailureIdParams): Promise<ExpiredDocumentIndexFailureDTO | null>

  abstract removeExpiredFailure(failure: DocumentIndexFailureIdParams): Promise<void>
}
