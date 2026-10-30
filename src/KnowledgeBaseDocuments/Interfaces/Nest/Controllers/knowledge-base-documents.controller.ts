import { Body, Controller, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'

import { ProjectServiceAuthGuard } from '../../../../Shared/Interfaces/Nest/Middleware/project-service-auth.guard.ts'
import { KnowledgeBaseDocumentRequestAssembler } from '../../../Application/Assemblers/knowledge-base-document-request.assembler.ts'
import { PruneKnowledgeBaseDocumentsCommandHandler } from '../../../Application/Commands/prune-knowledge-base-documents.command.handler.ts'
import { PruneKnowledgeBaseDocumentsRequest } from '../Requests/prune-knowledge-base-documents.request.ts'
import { PruneKnowledgeBaseDocumentsResource } from '../Resources/prune-knowledge-base-documents.resource.ts'

@Controller()
export class KnowledgeBaseDocumentsController {
  constructor(private readonly pruneKnowledgeBaseDocumentsUseCase: PruneKnowledgeBaseDocumentsCommandHandler) {}

  @Post('v1/knowledge-bases/:id/memberships/prune')
  @UseGuards(ProjectServiceAuthGuard)
  async prune(
    @Param('id', new ParseUUIDPipe({ version: 'all', errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }))
    id: string,
    @Body() body: PruneKnowledgeBaseDocumentsRequest,
  ): Promise<{ pruned: number }> {
    return PruneKnowledgeBaseDocumentsResource.toPruneKnowledgeBaseDocumentsResource(
      await this.pruneKnowledgeBaseDocumentsUseCase.execute(
        KnowledgeBaseDocumentRequestAssembler.toPruneKnowledgeBaseDocumentsCommand(body.toDTO(id)),
      ),
    )
  }
}
