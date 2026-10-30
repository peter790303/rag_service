import type { InspectDocumentIndexRetentionQuery } from './inspect-document-index-retention.query.ts'
import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import { DocumentIndexGarbageAssembler } from '../Assemblers/document-index-garbage.assembler.ts'
import type { InspectDocumentIndexRetentionQueryHandlerContract } from '../Contracts/inspect-document-index-retention.query.handler.contract.ts'
import type { DocumentIndexRepository } from '../Ports/Out/Repositories/document-index.repository.ts'

export class InspectDocumentIndexRetentionQueryHandler implements InspectDocumentIndexRetentionQueryHandlerContract {
  constructor(private readonly documentIndexRepository: DocumentIndexRepository) {}

  async execute(documentIndexRetentionDTO: InspectDocumentIndexRetentionQuery): Promise<DocumentIndex | null> {
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
