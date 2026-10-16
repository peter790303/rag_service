import { Body, Controller, Post, UseGuards } from '@nestjs/common'

import { RetrieveKnowledgeBaseContentUseCase } from '../../../Application/KnowledgeBases/UseCases/retrieve-knowledge-base-content.use-case.ts'
import { ProjectServiceAuthGuard } from '../Middleware/project-service-auth.guard.ts'
import { HybridKnowledgeRetrievalRequest } from '../Requests/hybrid-knowledge-retrieval.request.ts'
import { HybridKnowledgeRetrievalResource } from '../Resources/hybrid-knowledge-retrieval.resource.ts'

@Controller()
export class KnowledgeBaseRetrievalController {
  constructor(private readonly retrieveKnowledgeBaseContentUseCase: RetrieveKnowledgeBaseContentUseCase) {}

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
