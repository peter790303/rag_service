import type { StartDocumentPruningRetentionCommand } from './start-document-pruning-retention.command.ts'
import { RetentionDocumentAssembler } from '../Assemblers/retention-document.assembler.ts'
import type { StartDocumentPruningRetentionCommandHandlerContract } from '../Contracts/start-document-pruning-retention.command.handler.contract.ts'
import type { DocumentRepository } from '../Ports/Out/Repositories/document.repository.ts'
import type { InspectDocumentRetentionQueryHandler } from '../Queries/inspect-document-retention.query.handler.ts'

export class StartDocumentPruningRetentionCommandHandler implements StartDocumentPruningRetentionCommandHandlerContract {
  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly documentRetention: InspectDocumentRetentionQueryHandler,
  ) {}

  async execute({ documentId, now, lockedDocumentIds }: StartDocumentPruningRetentionCommand): Promise<void> {
    if (
      !lockedDocumentIds.includes(documentId) ||
      (await this.documentRetention.execute(RetentionDocumentAssembler.toInspectDocumentRetentionDTO(documentId)))
    )
      return

    const document = await this.documentRepository.findByDocumentId(
      RetentionDocumentAssembler.toDocumentIdQO(documentId),
    )

    if (document === null) return

    await this.documentRepository.updateUnreferencedSinceByDocumentIdAndUnreferencedSinceIsNull(
      RetentionDocumentAssembler.toMarkDocumentUnreferencedQO(document.id, document.startRetention(now)),
    )
  }
}
