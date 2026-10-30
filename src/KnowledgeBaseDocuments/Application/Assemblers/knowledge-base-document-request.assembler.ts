import type { PruneKnowledgeBaseDocumentsCommand } from '../Commands/prune-knowledge-base-documents.command.ts'
import type { PruneKnowledgeBaseDocumentsDTO } from '../DataTransferObjects/prune-knowledge-base-documents.dto.ts'

export class KnowledgeBaseDocumentRequestAssembler {
  static toPruneKnowledgeBaseDocumentsCommand(
    requestDTO: PruneKnowledgeBaseDocumentsDTO,
  ): PruneKnowledgeBaseDocumentsCommand {
    return {
      projectId: requestDTO.projectId,
      knowledgeBaseId: requestDTO.knowledgeBaseId,
      documentIds: requestDTO.documentIds,
    }
  }
}
