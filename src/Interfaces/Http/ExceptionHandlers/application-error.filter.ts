import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common'

import { ActiveDocumentIndexExecutionPreventsRetryException } from '../../../Application/DocumentIndexes/Exceptions/active-document-index-execution-prevents-retry.exception.ts'
import { DocumentDisappearedBeforeIndexCompletionException } from '../../../Application/DocumentIndexes/Exceptions/document-disappeared-before-index-completion.exception.ts'
import { DocumentIndexingFailureAlreadyRetriedException } from '../../../Application/DocumentIndexes/Exceptions/document-indexing-failure-already-retried.exception.ts'
import { DocumentIndexingFailureNotCurrentException } from '../../../Application/DocumentIndexes/Exceptions/document-indexing-failure-not-current.exception.ts'
import { DocumentIndexingNotFoundException } from '../../../Application/DocumentIndexes/Exceptions/document-indexing-not-found.exception.ts'
import { IndexDisappearedBeforeCompletionException } from '../../../Application/DocumentIndexes/Exceptions/index-disappeared-before-completion.exception.ts'
import { IndexRetryRevisionUnavailableException } from '../../../Application/DocumentIndexes/Exceptions/index-retry-revision-unavailable.exception.ts'
import { IndexRetrySourceChangedException } from '../../../Application/DocumentIndexes/Exceptions/index-retry-source-changed.exception.ts'
import { IndexRetrySourceUnavailableException } from '../../../Application/DocumentIndexes/Exceptions/index-retry-source-unavailable.exception.ts'
import { InvalidIndexRetrySourceContextException } from '../../../Application/DocumentIndexes/Exceptions/invalid-index-retry-source-context.exception.ts'
import { PreparedIndexCollectedException } from '../../../Application/DocumentIndexes/Exceptions/prepared-index-collected.exception.ts'
import { StaleDocumentIndexingFailureException } from '../../../Application/DocumentIndexes/Exceptions/stale-document-indexing-failure.exception.ts'
import { IndexRequestDocumentUnavailableException } from '../../../Application/Documents/Exceptions/index-request-document-unavailable.exception.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../Application/KnowledgeBases/Exceptions/knowledge-embedding-unavailable.exception.ts'
import { IndexRequestMembershipUnavailableException } from '../../../Application/Memberships/Exceptions/index-request-membership-unavailable.exception.ts'
import { KnowledgeIndexPendingException } from '../../../Domain/DocumentIndex/Exceptions/knowledge-index-pending.exception.ts'
import { KnowledgeBaseProjectMismatchException } from '../../../Domain/KnowledgeBase/Exceptions/knowledge-base-project-mismatch.exception.ts'
import { KnowledgeMembershipPruneConflictException } from '../../../Domain/Membership/Exceptions/knowledge-membership-prune-conflict.exception.ts'

type ApplicationError =
  | ActiveDocumentIndexExecutionPreventsRetryException
  | DocumentDisappearedBeforeIndexCompletionException
  | DocumentIndexingFailureAlreadyRetriedException
  | DocumentIndexingFailureNotCurrentException
  | IndexDisappearedBeforeCompletionException
  | IndexRetryRevisionUnavailableException
  | IndexRetrySourceChangedException
  | IndexRetrySourceUnavailableException
  | InvalidIndexRetrySourceContextException
  | PreparedIndexCollectedException
  | StaleDocumentIndexingFailureException
  | IndexRequestDocumentUnavailableException
  | IndexRequestMembershipUnavailableException
  | KnowledgeIndexPendingException
  | KnowledgeBaseProjectMismatchException
  | DocumentIndexingNotFoundException
  | KnowledgeEmbeddingUnavailableException
  | KnowledgeMembershipPruneConflictException

@Catch(
  ActiveDocumentIndexExecutionPreventsRetryException,
  DocumentDisappearedBeforeIndexCompletionException,
  DocumentIndexingFailureAlreadyRetriedException,
  DocumentIndexingFailureNotCurrentException,
  IndexDisappearedBeforeCompletionException,
  IndexRetryRevisionUnavailableException,
  IndexRetrySourceChangedException,
  IndexRetrySourceUnavailableException,
  InvalidIndexRetrySourceContextException,
  PreparedIndexCollectedException,
  StaleDocumentIndexingFailureException,
  IndexRequestDocumentUnavailableException,
  IndexRequestMembershipUnavailableException,
  KnowledgeIndexPendingException,
  KnowledgeBaseProjectMismatchException,
  DocumentIndexingNotFoundException,
  KnowledgeEmbeddingUnavailableException,
  KnowledgeMembershipPruneConflictException,
)
export class ApplicationErrorFilter implements ExceptionFilter {
  catch(error: ApplicationError, host: ArgumentsHost): void {
    const status = this.statusFor(error)
    const code = error.code
    host.switchToHttp().getResponse<{ status(code: number): { json(body: unknown): void } }>().status(status).json({
      code,
      message: error.message,
    })
  }

  private statusFor(error: ApplicationError): HttpStatus {
    if (error instanceof DocumentIndexingNotFoundException) return HttpStatus.NOT_FOUND

    if (error instanceof KnowledgeEmbeddingUnavailableException) return HttpStatus.BAD_GATEWAY

    return HttpStatus.CONFLICT
  }
}
