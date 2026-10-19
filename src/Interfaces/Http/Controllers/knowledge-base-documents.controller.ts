import { Body, Controller, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'

import { PruneKnowledgeBaseDocumentsUseCase } from '../../../Application/KnowledgeBaseDocuments/UseCases/prune-knowledge-base-documents.use-case.ts'
import { ProjectServiceAuthGuard } from '../Middleware/project-service-auth.guard.ts'
import { PruneKnowledgeBaseDocumentsRequest } from '../Requests/prune-knowledge-base-documents.request.ts'
import { PruneKnowledgeBaseDocumentsResource } from '../Resources/prune-knowledge-base-documents.resource.ts'

@Controller()
export class KnowledgeBaseDocumentsController {
  constructor(private readonly pruneKnowledgeBaseDocumentsUseCase: PruneKnowledgeBaseDocumentsUseCase) {}

  @Post('v1/knowledge-bases/:id/memberships/prune')
  @UseGuards(ProjectServiceAuthGuard)
  async prune(
    @Param('id', new ParseUUIDPipe({ version: 'all', errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }))
    id: string,
    @Body() body: PruneKnowledgeBaseDocumentsRequest,
  ): Promise<{ pruned: number }> {
    return PruneKnowledgeBaseDocumentsResource.toPruneKnowledgeBaseDocumentsResource(
      await this.pruneKnowledgeBaseDocumentsUseCase.execute(body.toDTO(id)),
    )
  }
}
