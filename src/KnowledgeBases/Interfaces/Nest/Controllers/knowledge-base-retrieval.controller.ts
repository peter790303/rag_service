import { Body, Controller, Post, UseGuards } from '@nestjs/common'

import { ProjectServiceAuthGuard } from '../../../../Shared/Interfaces/Nest/Middleware/project-service-auth.guard.ts'
import { RetrieveKnowledgeBaseContentQueryHandler } from '../../../Application/Queries/retrieve-knowledge-base-content.query.handler.ts'
import { HybridKnowledgeRetrievalRequest } from '../Requests/hybrid-knowledge-retrieval.request.ts'
import { HybridKnowledgeRetrievalResource } from '../Resources/hybrid-knowledge-retrieval.resource.ts'

@Controller()
export class KnowledgeBaseRetrievalController {
  constructor(private readonly retrieveKnowledgeBaseContentUseCase: RetrieveKnowledgeBaseContentQueryHandler) {}

  @Post('v1/retrieve/hybrid')
  @UseGuards(ProjectServiceAuthGuard)
  async retrieve(
    @Body() body: HybridKnowledgeRetrievalRequest,
  ): Promise<ReturnType<typeof HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource>> {
    return HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
      await this.retrieveKnowledgeBaseContentUseCase.execute(body.toDTO()),
    )
  }
}
