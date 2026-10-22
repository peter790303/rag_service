import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common'

import { ListKnowledgeGraphProjectsUseCase } from '../../../Application/KnowledgeBases/UseCases/list-knowledge-graph-projects.use-case.ts'
import { LoadKnowledgeGraphUseCase } from '../../../Application/KnowledgeBases/UseCases/load-knowledge-graph.use-case.ts'
import { ProjectServiceAuthGuard } from '../Middleware/project-service-auth.guard.ts'
import { KnowledgeGraphRequest } from '../Requests/knowledge-graph.request.ts'
import { KnowledgeGraphProjectsResource } from '../Resources/knowledge-graph-projects.resource.ts'
import { KnowledgeGraphResource } from '../Resources/knowledge-graph.resource.ts'

@Controller()
export class KnowledgeGraphController {
  constructor(
    private readonly loadKnowledgeGraph: LoadKnowledgeGraphUseCase,
    private readonly listKnowledgeGraphProjects: ListKnowledgeGraphProjectsUseCase,
  ) {}

  @Get('v1/knowledge-graph/projects')
  @UseGuards(ProjectServiceAuthGuard)
  async listProjects() {
    const knowledgeBases = await this.listKnowledgeGraphProjects.execute()

    return KnowledgeGraphProjectsResource.fromKnowledgeBases(knowledgeBases)
  }

  @Get('v1/projects/:projectId/knowledge-graph')
  @UseGuards(ProjectServiceAuthGuard)
  async getGraph(@Param('projectId') projectId: string, @Query() query: KnowledgeGraphRequest) {
    const knowledgeBase = await this.loadKnowledgeGraph.execute(query.toDTO(projectId))

    if (!knowledgeBase) throw new NotFoundException('Knowledge base not found.')

    return KnowledgeGraphResource.fromKnowledgeBase(knowledgeBase)
  }
}
