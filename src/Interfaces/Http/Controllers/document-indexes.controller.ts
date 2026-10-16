import { Body, Controller, Get, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'

import type { DocumentIndexRequestResult } from '../../../Application/DocumentIndexes/DataTransferObjects/document-index-request.dto.ts'
import type { DocumentIndexingStatusDto } from '../../../Application/DocumentIndexes/DataTransferObjects/document-indexing-status.dto.ts'
import type { RetryDocumentIndexingResultDto } from '../../../Application/DocumentIndexes/DataTransferObjects/retry-document-indexing-result.dto.ts'
import { DocumentIndexingRequestedEvent } from '../../../Application/DocumentIndexes/Events/document-indexing-requested.event.ts'
import { DocumentIndexingRequestedListener } from '../../../Application/DocumentIndexes/Listeners/document-indexing-requested.listener.ts'
import { ReadDocumentIndexingStatusListener } from '../../../Application/DocumentIndexes/Listeners/read-document-indexing-status.listener.ts'
import { RetryDocumentIndexingListener } from '../../../Application/DocumentIndexes/Listeners/retry-document-indexing.listener.ts'
import { ProjectServiceAuthGuard } from '../Middleware/project-service-auth.guard.ts'
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
  ): Promise<DocumentIndexingStatusDto> {
    return DocumentIndexingStatusResource.toDocumentIndexingStatusResource(
      await this.readDocumentIndexingStatus.handle({ projectId, jobId: id }),
    )
  }

  @Post('v1/projects/:projectId/failed-jobs/:id/retry')
  @UseGuards(ProjectServiceAuthGuard)
  async retry(
    @Param('projectId') projectId: string,
    @Param('id', uuidParamPipe) id: string,
  ): Promise<RetryDocumentIndexingResultDto> {
    return RetryDocumentIndexingResource.toRetryDocumentIndexingResource(
      await this.retryDocumentIndexing.handle({ projectId, failedJobId: id }),
    )
  }
}
