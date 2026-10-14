import { Body, Controller, Get, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'

import type {
  RagIndexRequestResult,
  RagJobStatusDto,
  RetryFailedJobDto,
} from '../../../Application/KnowledgeBases/DataTransferObjects/rag.dto.js'
import { GetRagJobStatusUseCase } from '../../../Application/KnowledgeBases/UseCases/get-rag-job-status.use-case.js'
import { PruneRagMembershipsUseCase } from '../../../Application/KnowledgeBases/UseCases/prune-rag-memberships.use-case.js'
import { RequestRagIndexUseCase } from '../../../Application/KnowledgeBases/UseCases/request-rag-index.use-case.js'
import { RetrieveRagUseCase } from '../../../Application/KnowledgeBases/UseCases/retrieve-rag.use-case.js'
import { RetryFailedRagJobUseCase } from '../../../Application/KnowledgeBases/UseCases/retry-failed-rag-job.use-case.js'
import { RagServiceAuthGuard } from '../Middleware/rag-service-auth.guard.js'
import { HybridRetrieveRequest, PruneMembershipsRequest, RagSourceDocumentRequest } from '../Requests/rag.request.js'
import {
  HybridRetrievalResource,
  PruneMembershipsResource,
  RagIndexRequestResource,
  RagJobStatusResource,
  RetryFailedJobResource,
} from '../Resources/rag.resource.js'

const uuidParamPipe = new ParseUUIDPipe({ version: 'all', errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY })

@Controller()
export class RagController {
  constructor(
    private readonly requestIndex: RequestRagIndexUseCase,
    private readonly retrieveRag: RetrieveRagUseCase,
    private readonly getJobStatus: GetRagJobStatusUseCase,
    private readonly retryFailedJob: RetryFailedRagJobUseCase,
    private readonly pruneMemberships: PruneRagMembershipsUseCase,
  ) {}

  @Get('health')
  health(): { status: string } {
    return { status: 'ok' }
  }

  @Post('v1/index-requests')
  @UseGuards(RagServiceAuthGuard)
  async index(@Body() body: RagSourceDocumentRequest): Promise<RagIndexRequestResult> {
    return RagIndexRequestResource.from(await this.requestIndex.execute(body.toDTO()))
  }

  @Post('v1/retrieve/hybrid')
  @UseGuards(RagServiceAuthGuard)
  async retrieve(@Body() body: HybridRetrieveRequest): ReturnType<RetrieveRagUseCase['execute']> {
    return HybridRetrievalResource.from(await this.retrieveRag.execute(body.toDTO()))
  }

  @Get('v1/projects/:projectId/jobs/:id')
  @UseGuards(RagServiceAuthGuard)
  async job(@Param('projectId') projectId: string, @Param('id', uuidParamPipe) id: string): Promise<RagJobStatusDto> {
    return RagJobStatusResource.from(await this.getJobStatus.execute(projectId, id))
  }

  @Post('v1/projects/:projectId/failed-jobs/:id/retry')
  @UseGuards(RagServiceAuthGuard)
  async retry(
    @Param('projectId') projectId: string,
    @Param('id', uuidParamPipe) id: string,
  ): Promise<RetryFailedJobDto> {
    return RetryFailedJobResource.from(await this.retryFailedJob.execute(projectId, id))
  }

  @Post('v1/knowledge-bases/:id/memberships/prune')
  @UseGuards(RagServiceAuthGuard)
  async prune(
    @Param('id', uuidParamPipe) id: string,
    @Body() body: PruneMembershipsRequest,
  ): ReturnType<PruneRagMembershipsUseCase['execute']> {
    return PruneMembershipsResource.from(await this.pruneMemberships.execute(body.toDTO(id)))
  }
}
