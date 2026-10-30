import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common'

import { ActiveDocumentIndexExecutionPreventsRetryException } from '../../../../DocumentIndexes/Application/Exceptions/active-document-index-execution-prevents-retry.exception.ts'
import { DocumentDisappearedBeforeIndexCompletionException } from '../../../../DocumentIndexes/Application/Exceptions/document-disappeared-before-index-completion.exception.ts'
import { DocumentIndexingFailureAlreadyRetriedException } from '../../../../DocumentIndexes/Application/Exceptions/document-indexing-failure-already-retried.exception.ts'
import { DocumentIndexingFailureNotCurrentException } from '../../../../DocumentIndexes/Application/Exceptions/document-indexing-failure-not-current.exception.ts'
import { DocumentIndexingNotFoundException } from '../../../../DocumentIndexes/Application/Exceptions/document-indexing-not-found.exception.ts'
import { IndexDisappearedBeforeCompletionException } from '../../../../DocumentIndexes/Application/Exceptions/index-disappeared-before-completion.exception.ts'
import { IndexRetryRevisionUnavailableException } from '../../../../DocumentIndexes/Application/Exceptions/index-retry-revision-unavailable.exception.ts'
import { IndexRetrySourceChangedException } from '../../../../DocumentIndexes/Application/Exceptions/index-retry-source-changed.exception.ts'
import { IndexRetrySourceUnavailableException } from '../../../../DocumentIndexes/Application/Exceptions/index-retry-source-unavailable.exception.ts'
import { InvalidIndexRetrySourceContextException } from '../../../../DocumentIndexes/Application/Exceptions/invalid-index-retry-source-context.exception.ts'
import { PreparedIndexCollectedException } from '../../../../DocumentIndexes/Application/Exceptions/prepared-index-collected.exception.ts'
import { StaleDocumentIndexingFailureException } from '../../../../DocumentIndexes/Application/Exceptions/stale-document-indexing-failure.exception.ts'
import { KnowledgeIndexPendingException } from '../../../../DocumentIndexes/Domain/Exceptions/knowledge-index-pending.exception.ts'
import { IndexRequestDocumentUnavailableException } from '../../../../Documents/Application/Exceptions/index-request-document-unavailable.exception.ts'
import { IndexRequestKnowledgeBaseDocumentUnavailableException } from '../../../../KnowledgeBaseDocuments/Application/Exceptions/index-request-knowledge-base-document-unavailable.exception.ts'
import { KnowledgeBaseDocumentPruneConflictException } from '../../../../KnowledgeBaseDocuments/Domain/Exceptions/knowledge-base-document-prune-conflict.exception.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../../KnowledgeBases/Application/Exceptions/knowledge-embedding-unavailable.exception.ts'
import { KnowledgeBaseProjectMismatchException } from '../../../../KnowledgeBases/Domain/Exceptions/knowledge-base-project-mismatch.exception.ts'
import { KnowledgeRetrievalIncompleteException } from '../../../../KnowledgeBases/Domain/Exceptions/knowledge-retrieval-incomplete.exception.ts'

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
  | IndexRequestKnowledgeBaseDocumentUnavailableException
  | KnowledgeIndexPendingException
  | KnowledgeBaseProjectMismatchException
  | KnowledgeRetrievalIncompleteException
  | DocumentIndexingNotFoundException
  | KnowledgeEmbeddingUnavailableException
  | KnowledgeBaseDocumentPruneConflictException

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
  IndexRequestKnowledgeBaseDocumentUnavailableException,
  KnowledgeIndexPendingException,
  KnowledgeBaseProjectMismatchException,
  KnowledgeRetrievalIncompleteException,
  DocumentIndexingNotFoundException,
  KnowledgeEmbeddingUnavailableException,
  KnowledgeBaseDocumentPruneConflictException,
)
export class ApplicationErrorFilter implements ExceptionFilter {
  catch(error: ApplicationError, host: ArgumentsHost): void {
    const status = this.statusFor(error)
    const code = error.code
    host
      .switchToHttp()
      .getResponse<{ status(code: number): { json(body: unknown): void } }>()
      .status(status)
      .json({
        code,
        message:
          error instanceof KnowledgeRetrievalIncompleteException
            ? 'Knowledge retrieval is missing required facts'
            : error.message,
      })
  }

  private statusFor(error: ApplicationError): HttpStatus {
    if (error instanceof DocumentIndexingNotFoundException) return HttpStatus.NOT_FOUND

    if (error instanceof KnowledgeEmbeddingUnavailableException) return HttpStatus.BAD_GATEWAY

    return HttpStatus.CONFLICT
  }
}
