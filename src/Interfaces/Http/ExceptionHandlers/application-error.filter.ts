import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common'

import { KnowledgeBaseProjectMismatchException } from '../../../Domain/Knowledge/Exceptions/knowledge-base-project-mismatch.exception.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'
import { KnowledgeIndexPendingException } from '../../../Domain/Knowledge/Exceptions/knowledge-index-pending.exception.js'
import { KnowledgeJobNotFoundException } from '../../../Domain/Knowledge/Exceptions/knowledge-job-not-found.exception.js'
import { KnowledgeMembershipPruneConflictException } from '../../../Domain/Knowledge/Exceptions/knowledge-membership-prune-conflict.exception.js'

@Catch(
  KnowledgeIndexPendingException,
  KnowledgeBaseProjectMismatchException,
  KnowledgeJobNotFoundException,
  KnowledgeEmbeddingUnavailableException,
  KnowledgeMembershipPruneConflictException,
)
export class ApplicationErrorFilter implements ExceptionFilter {
  catch(
    error:
      | KnowledgeIndexPendingException
      | KnowledgeBaseProjectMismatchException
      | KnowledgeJobNotFoundException
      | KnowledgeEmbeddingUnavailableException
      | KnowledgeMembershipPruneConflictException,
    host: ArgumentsHost,
  ): void {
    const status =
      error instanceof KnowledgeJobNotFoundException
        ? HttpStatus.NOT_FOUND
        : error instanceof KnowledgeEmbeddingUnavailableException
          ? HttpStatus.BAD_GATEWAY
          : HttpStatus.CONFLICT
    const code = error.code
    host.switchToHttp().getResponse<{ status(code: number): { json(body: unknown): void } }>().status(status).json({
      code,
      message: error.message,
    })
  }
}
