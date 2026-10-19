import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import { GarbageDocumentRelationAssembler } from '../Assemblers/garbage-document-relation.assembler.ts'
import type { DocumentRelationRepository } from '../Contracts/document-relation.repository.ts'
import type { InspectDocumentRelationRetentionUseCaseContract } from '../Contracts/inspect-document-relation-retention.use-case.contract.ts'
import type { InspectDocumentRelationRetentionDTO } from '../DataTransferObjects/inspect-document-relation-retention.dto.ts'
import { DocumentRelationInputGuard } from '../Guards/document-relation-input.guard.ts'

export class InspectDocumentRelationRetentionUseCase implements InspectDocumentRelationRetentionUseCaseContract {
  constructor(private readonly documentRelationRepository: DocumentRelationRepository) {}

  async execute(
    inspectDocumentRelationRetentionDTO: InspectDocumentRelationRetentionDTO,
  ): Promise<DocumentRelation | null> {
    DocumentRelationInputGuard.assertObject(inspectDocumentRelationRetentionDTO)
    DocumentRelationInputGuard.assertIdentifier(inspectDocumentRelationRetentionDTO.documentId, 'documentId')

    return this.documentRelationRepository.findByTargetDocumentId(
      GarbageDocumentRelationAssembler.toDocumentRelationTargetDocumentQueryObject(
        inspectDocumentRelationRetentionDTO.documentId,
      ),
    )
  }
}
