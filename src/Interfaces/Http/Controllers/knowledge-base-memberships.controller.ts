import { Body, Controller, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'

import { PruneKnowledgeBaseMembershipsUseCase } from '../../../Application/Memberships/UseCases/prune-knowledge-base-memberships.use-case.ts'
import { ProjectServiceAuthGuard } from '../Middleware/project-service-auth.guard.ts'
import { PruneKnowledgeBaseMembershipsRequest } from '../Requests/prune-knowledge-base-memberships.request.ts'
import { PruneKnowledgeBaseMembershipsResource } from '../Resources/prune-knowledge-base-memberships.resource.ts'

@Controller()
export class KnowledgeBaseMembershipsController {
  constructor(private readonly pruneKnowledgeBaseMembershipsUseCase: PruneKnowledgeBaseMembershipsUseCase) {}

  @Post('v1/knowledge-bases/:id/memberships/prune')
  @UseGuards(ProjectServiceAuthGuard)
  async prune(
    @Param('id', new ParseUUIDPipe({ version: 'all', errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }))
    id: string,
    @Body() body: PruneKnowledgeBaseMembershipsRequest,
  ): Promise<{ pruned: number }> {
    return PruneKnowledgeBaseMembershipsResource.toPruneKnowledgeBaseMembershipsResource(
      await this.pruneKnowledgeBaseMembershipsUseCase.execute(body.toDTO(id)),
    )
  }
}
