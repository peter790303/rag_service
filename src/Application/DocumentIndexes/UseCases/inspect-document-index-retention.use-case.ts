import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import { DocumentIndexGarbageAssembler } from '../Assemblers/document-index-garbage.assembler.ts'
import type { DocumentIndexRepository } from '../Contracts/document-index.repository.ts'
import type { InspectDocumentIndexRetentionUseCaseContract } from '../Contracts/inspect-document-index-retention.use-case.contract.ts'
import type { DocumentIndexRetentionDTO } from '../DataTransferObjects/document-index-garbage.dto.ts'

export class InspectDocumentIndexRetentionUseCase implements InspectDocumentIndexRetentionUseCaseContract {
  constructor(private readonly documentIndexRepository: DocumentIndexRepository) {}

  async execute(documentIndexRetentionDTO: DocumentIndexRetentionDTO): Promise<DocumentIndex | null> {
    if ('revisionId' in documentIndexRetentionDTO)
      return (
        (
          await this.documentIndexRepository.findByRevisionId(
            DocumentIndexGarbageAssembler.toDocumentIndexRevisionQueryObject(documentIndexRetentionDTO.revisionId),
          )
        )[0] ?? null
      )

    const indexes = await this.documentIndexRepository.findByDocumentId(
      DocumentIndexGarbageAssembler.toDocumentIndexDocumentQueryObject(documentIndexRetentionDTO.documentId),
    )

    return indexes[0] ?? null
  }
}
