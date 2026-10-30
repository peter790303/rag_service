import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common'

import { ProjectServiceAuthGuard } from '../../../../Shared/Interfaces/Nest/Middleware/project-service-auth.guard.ts'
import { ListKnowledgeGraphProjectsQueryHandler } from '../../../Application/Queries/list-knowledge-graph-projects.query.handler.ts'
import { LoadKnowledgeGraphQueryHandler } from '../../../Application/Queries/load-knowledge-graph.query.handler.ts'
import { KnowledgeGraphRequest } from '../Requests/knowledge-graph.request.ts'
import { KnowledgeGraphProjectsResource } from '../Resources/knowledge-graph-projects.resource.ts'
import { KnowledgeGraphResource } from '../Resources/knowledge-graph.resource.ts'

@Controller()
export class KnowledgeGraphController {
  constructor(
    private readonly loadKnowledgeGraph: LoadKnowledgeGraphQueryHandler,
    private readonly listKnowledgeGraphProjects: ListKnowledgeGraphProjectsQueryHandler,
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
