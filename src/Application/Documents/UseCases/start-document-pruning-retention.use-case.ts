import type { InspectDocumentRetentionUseCase } from './inspect-document-retention.use-case.ts'
import { RetentionDocumentAssembler } from '../Assemblers/retention-document.assembler.ts'
import type { DocumentRepository } from '../Contracts/document.repository.ts'
import type { StartDocumentPruningRetentionUseCaseContract } from '../Contracts/start-document-pruning-retention.use-case.contract.ts'
import type { StartDocumentPruningRetentionDto } from '../DataTransferObjects/start-document-pruning-retention.dto.ts'

export class StartDocumentPruningRetentionUseCase implements StartDocumentPruningRetentionUseCaseContract {
  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly documentRetention: InspectDocumentRetentionUseCase,
  ) {}

  async execute({ documentId, now, lockedDocumentIds }: StartDocumentPruningRetentionDto): Promise<void> {
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
