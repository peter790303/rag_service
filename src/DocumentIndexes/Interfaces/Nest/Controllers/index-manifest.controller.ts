import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common'

import { LoadIndexManifestQueryHandler } from '../../../../KnowledgeBases/Application/Queries/load-index-manifest.query.handler.ts'
import { ProjectServiceAuthGuard } from '../../../../Shared/Interfaces/Nest/Middleware/project-service-auth.guard.ts'
import { LoadIndexManifestRequest } from '../Requests/load-index-manifest.request.ts'
import { IndexManifestResource, type IndexManifestResponse } from '../Resources/index-manifest.resource.ts'

@Controller()
export class IndexManifestController {
  constructor(private readonly loadIndexManifest: LoadIndexManifestQueryHandler) {}

  @Get('v1/projects/:projectId/index-manifest')
  @UseGuards(ProjectServiceAuthGuard)
  async getManifest(@Param() loadIndexManifestRequest: LoadIndexManifestRequest): Promise<IndexManifestResponse> {
    const knowledgeBase = await this.loadIndexManifest.execute(loadIndexManifestRequest.toDTO())

    if (!knowledgeBase) throw new NotFoundException('Knowledge base not found')

    return IndexManifestResource.fromKnowledgeBase(knowledgeBase)
  }
}
