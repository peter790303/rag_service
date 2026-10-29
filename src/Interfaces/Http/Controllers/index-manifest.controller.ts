import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common'

import { LoadIndexManifestUseCase } from '../../../Application/KnowledgeBases/UseCases/load-index-manifest.use-case.ts'
import { ProjectServiceAuthGuard } from '../Middleware/project-service-auth.guard.ts'
import { LoadIndexManifestRequest } from '../Requests/load-index-manifest.request.ts'
import { IndexManifestResource, type IndexManifestResponse } from '../Resources/index-manifest.resource.ts'

@Controller()
export class IndexManifestController {
  constructor(private readonly loadIndexManifest: LoadIndexManifestUseCase) {}

  @Get('v1/projects/:projectId/index-manifest')
  @UseGuards(ProjectServiceAuthGuard)
  async getManifest(@Param() loadIndexManifestRequest: LoadIndexManifestRequest): Promise<IndexManifestResponse> {
    const knowledgeBase = await this.loadIndexManifest.execute(loadIndexManifestRequest.toDTO())

    if (!knowledgeBase) throw new NotFoundException('Knowledge base not found')

    return IndexManifestResource.fromKnowledgeBase(knowledgeBase)
  }
}
