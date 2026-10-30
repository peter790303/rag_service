import { Body, Controller, Get, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'

import { ProjectServiceAuthGuard } from '../../../../Shared/Interfaces/Nest/Middleware/project-service-auth.guard.ts'
import type { DocumentIndexRequestResult } from '../../../Application/DataTransferObjects/document-index-request.dto.ts'
import type { DocumentIndexingStatusDTO } from '../../../Application/DataTransferObjects/document-indexing-status.dto.ts'
import type { RetryDocumentIndexingResultDTO } from '../../../Application/DataTransferObjects/retry-document-indexing-result.dto.ts'
import { DocumentIndexingRequestedEvent } from '../../../Application/Events/document-indexing-requested.event.ts'
import { DocumentIndexingRequestedListener } from '../../../Application/Listeners/document-indexing-requested.listener.ts'
import { ReadDocumentIndexingStatusListener } from '../../../Application/Listeners/read-document-indexing-status.listener.ts'
import { RetryDocumentIndexingListener } from '../../../Application/Listeners/retry-document-indexing.listener.ts'
import { SourceDocumentIndexRequest } from '../Requests/source-document-index.request.ts'
import { DocumentIndexRequestResource } from '../Resources/document-index-request.resource.ts'
import { DocumentIndexingStatusResource } from '../Resources/document-indexing-status.resource.ts'
import { RetryDocumentIndexingResource } from '../Resources/retry-document-indexing.resource.ts'

const uuidParamPipe = new ParseUUIDPipe({ version: 'all', errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY })

@Controller()
export class DocumentIndexesController {
  constructor(
    private readonly documentIndexingRequested: DocumentIndexingRequestedListener,
    private readonly readDocumentIndexingStatus: ReadDocumentIndexingStatusListener,
    private readonly retryDocumentIndexing: RetryDocumentIndexingListener,
  ) {}

  @Post('v1/index-requests')
  @UseGuards(ProjectServiceAuthGuard)
  async index(@Body() body: SourceDocumentIndexRequest): Promise<DocumentIndexRequestResult> {
    return DocumentIndexRequestResource.toDocumentIndexRequestResource(
      await this.documentIndexingRequested.handle(new DocumentIndexingRequestedEvent(body.toDTO())),
    )
  }

  @Get('v1/projects/:projectId/jobs/:id')
  @UseGuards(ProjectServiceAuthGuard)
  async job(
    @Param('projectId') projectId: string,
    @Param('id', uuidParamPipe) id: string,
  ): Promise<DocumentIndexingStatusDTO> {
    return DocumentIndexingStatusResource.toDocumentIndexingStatusResource(
      await this.readDocumentIndexingStatus.handle({ projectId, jobId: id }),
    )
  }

  @Post('v1/projects/:projectId/failed-jobs/:id/retry')
  @UseGuards(ProjectServiceAuthGuard)
  async retry(
    @Param('projectId') projectId: string,
    @Param('id', uuidParamPipe) id: string,
  ): Promise<RetryDocumentIndexingResultDTO> {
    return RetryDocumentIndexingResource.toRetryDocumentIndexingResource(
      await this.retryDocumentIndexing.handle({ projectId, failedJobId: id }),
    )
  }
}
